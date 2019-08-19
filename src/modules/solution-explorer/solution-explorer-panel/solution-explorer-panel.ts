import {EventAggregator, Subscription} from 'aurelia-event-aggregator';
import {bindable, computedFrom, inject, observable} from 'aurelia-framework';
import {Router} from 'aurelia-router';

import {IDiagram} from '@process-engine/solutionexplorer.contracts';

import {
  AuthenticationStateEvent,
  IFile,
  IInputEvent,
  ISolutionEntry,
  ISolutionService,
  NotificationType,
} from '../../../contracts/index';

import environment from '../../../environment';
import {NotificationService} from '../../../services/notification-service/notification.service';
import {SolutionExplorerList} from '../solution-explorer-list/solution-explorer-list';

type RemoteSolutionListEntry = {
  uri: string;
  status: boolean;
  version?: Version;
};

enum Version {
  Dev = 'Development',
  Alpha = 'BPMN Studio Alpha',
  Beta = 'BPMN Studio Beta',
  Stable = 'BPMN Studio',
}

/**
 * This component handels:
 *  - Opening files via drag and drop
 *  - Opening files via double click
 *  - Opening solution/diagrams via input field
 *  - Refreshing all opened solutions via button
 *  - Refreshing on login/logout
 *  - Updating the remote processengine uri if needed
 */
@inject(EventAggregator, 'NotificationService', Router, 'SolutionService')
export class SolutionExplorerPanel {
  @observable public selectedProtocol: string = 'http://';

  // Fields below are bound from the html view.
  public solutionExplorerList: SolutionExplorerList;
  public solutionInput: HTMLInputElement;
  public openDiagramInput: HTMLInputElement;
  public showOpenRemoteSolutionModal: boolean = false;
  @bindable public uriOfRemoteSolutionWithoutProtocol: string;
  public solutionExplorerPanel: SolutionExplorerPanel = this;
  public remoteSolutionHistoryStatus: Map<string, boolean> = new Map<string, boolean>();
  public availableDefaultRemoteSolutions: Array<RemoteSolutionListEntry> = [];
  public isConnecting: boolean = false;
  public connectionError: string;

  private eventAggregator: EventAggregator;
  private notificationService: NotificationService;
  private router: Router;
  // TODO: Add typings
  private ipcRenderer: any | null = null;
  private subscriptions: Array<Subscription> = [];
  private solutionService: ISolutionService;
  private remoteSolutionHistoryStatusPollingTimer: NodeJS.Timer;
  private remoteSolutionHistoryStatusIsPolling: boolean;

  constructor(
    eventAggregator: EventAggregator,
    notificationService: NotificationService,
    router: Router,
    solutionService: ISolutionService,
  ) {
    this.eventAggregator = eventAggregator;
    this.notificationService = notificationService;
    this.router = router;
    this.solutionService = solutionService;

    if (this.canReadFromFileSystem()) {
      this.ipcRenderer = (window as any).nodeRequire('electron').ipcRenderer;
    }
  }

  public async bind(): Promise<void> {
    // Open the solution of the currently configured processengine instance on startup.
    const uriOfProcessEngine: string = window.localStorage.getItem('InternalProcessEngineRoute');

    const persistedInternalSolution: ISolutionEntry = this.solutionService.getSolutionEntryForUri(uriOfProcessEngine);
    const internalSolutionWasPersisted: boolean = persistedInternalSolution !== undefined;

    try {
      if (internalSolutionWasPersisted) {
        this.solutionExplorerList.openSolution(uriOfProcessEngine, false, persistedInternalSolution.identity);
      } else {
        this.solutionExplorerList.openSolution(uriOfProcessEngine);
      }
    } catch {
      return;
    }

    // Open the previously opened solutions.
    const previouslyOpenedSolutions: Array<ISolutionEntry> = this.solutionService.getPersistedEntries();
    previouslyOpenedSolutions.forEach((entry: ISolutionEntry) => {
      // We are not adding the solution of the connect PE here again since that happened above.
      const entryIsNotConnectedProcessEngine: boolean = entry.uri !== uriOfProcessEngine;
      if (entryIsNotConnectedProcessEngine) {
        /**
         * Since we can't distinguish if the persisted ProcessEngine was an
         * internal or external one yet, we consume any connection error
         * produced by the openSolution method.
         */
        try {
          this.solutionExplorerList.openSolution(entry.uri, false, entry.identity);
        } catch (error) {
          // Do nothing
        }
      }
    });

    const persistedOpenDiagrams: Array<IDiagram> = this.solutionService.getOpenDiagrams();
    persistedOpenDiagrams.forEach((diagram: IDiagram) => {
      try {
        this.solutionExplorerList.openDiagram(diagram.uri);
      } catch {
        // Do nothing
      }
    });
  }

  public async attached(): Promise<void> {
    if (this.canReadFromFileSystem()) {
      this.registerElectronHooks();
      document.addEventListener('drop', this.openDiagramOnDropBehaviour);
    }

    this.subscriptions = [
      this.eventAggregator.subscribe(environment.events.diagramDetail.onDiagramDeployed, () => {
        this.refreshSolutions();
      }),
      this.eventAggregator.subscribe(environment.events.startPage.openLocalSolution, () => {
        this.openSolution();
      }),
      this.eventAggregator.subscribe(environment.events.startPage.openDiagram, () => {
        this.openDiagram();
      }),
      this.eventAggregator.subscribe(environment.events.startPage.createDiagram, () => {
        this.createNewDiagram();
      }),
      this.eventAggregator.subscribe(AuthenticationStateEvent.LOGOUT, () => {
        this.solutionExplorerList.refreshSolutions();
      }),
    ];
  }

  public detached(): void {
    if (this.canReadFromFileSystem()) {
      this.removeElectronFileOpeningHooks();
      document.removeEventListener('drop', this.openDiagramOnDropBehaviour);
    }

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  public async openRemoteSolutionModal(): Promise<void> {
    this.showOpenRemoteSolutionModal = true;

    await this.updateRemoteSolutionHistoryStatus();
    this.startPollingOfRemoteSolutionHistoryStatus();
    this.updateDefaultRemoteSolutions();
  }

  public removeSolutionFromHistory(solutionUri: string): void {
    this.removeSolutionFromSolutionHistroy(solutionUri);
  }

  public selectProtocol(protocol: string): void {
    this.selectedProtocol = protocol;
  }

  public closeRemoteSolutionModal(): void {
    this.isConnecting = false;
    this.showOpenRemoteSolutionModal = false;
    this.uriOfRemoteSolutionWithoutProtocol = undefined;
    this.stopPollingOfRemoteSolutionHistoryStatus();
    this.connectionError = undefined;
  }

  public async openRemoteSolution(): Promise<void> {
    if (!this.uriIsValid || this.uriIsEmpty) {
      return;
    }

    this.connectionError = undefined;

    try {
      const lastCharacterIsASlash: boolean = this.uriOfRemoteSolutionWithoutProtocol.endsWith('/');
      if (lastCharacterIsASlash) {
        this.uriOfRemoteSolutionWithoutProtocol = this.uriOfRemoteSolutionWithoutProtocol.slice(0, -1);
      }

      await this.addSolutionToRemoteSolutionHistory(this.uriOfRemoteSolution);

      this.isConnecting = true;
      await this.solutionExplorerList.openSolution(this.uriOfRemoteSolution);
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;

      const genericMessage: string = `Unable to connect to ProcessEngine on: ${this.uriOfRemoteSolution}`;
      const cause: string = error.message ? error.message : '';

      this.connectionError = `${genericMessage}\n${cause}`;

      return;
    }

    this.closeRemoteSolutionModal();
  }

  public get connectionErrorExists(): boolean {
    return this.connectionError !== undefined;
  }

  public get remoteSolutionHistoryWithStatus(): Array<RemoteSolutionListEntry> {
    return this.loadRemoteSolutionHistory()
      .reverse()
      .map((solutionUri: string) => {
        return {
          uri: solutionUri,
          status: this.remoteSolutionHistoryStatus.get(solutionUri),
        };
      });
  }

  @computedFrom('suggestedRemoteSolutions.length')
  public get unconnectedSuggestedRemoteSolutions(): Array<RemoteSolutionListEntry> {
    const connectedSolutions: Array<ISolutionEntry> = this.solutionService.getAllSolutionEntries();

    const unconnectedSuggestedRemoteSolutions: Array<RemoteSolutionListEntry> = this.suggestedRemoteSolutions.filter(
      (remoteSolution) => {
        return !connectedSolutions.some((connectedSolution: ISolutionEntry) => {
          return connectedSolution.uri === remoteSolution.uri;
        });
      },
    );

    return unconnectedSuggestedRemoteSolutions;
  }

  @computedFrom('availableDefaultRemoteSolutions.length', 'remoteSolutionHistoryWithStatus.length')
  public get suggestedRemoteSolutions(): Array<RemoteSolutionListEntry> {
    const filteredRemoteSolutionHistory: Array<RemoteSolutionListEntry> = this.remoteSolutionHistoryWithStatus.filter(
      (remoteSolution: RemoteSolutionListEntry) => {
        const remoteSolutionIsDefaultRemoteSolution: boolean = this.availableDefaultRemoteSolutions.some(
          (defaultRemoteSolution: RemoteSolutionListEntry) => {
            return defaultRemoteSolution.uri === remoteSolution.uri;
          },
        );

        return !remoteSolutionIsDefaultRemoteSolution;
      },
    );

    const suggestedRemoteSolutions: Array<RemoteSolutionListEntry> = [
      ...this.availableDefaultRemoteSolutions,
      ...filteredRemoteSolutionHistory,
    ];

    return suggestedRemoteSolutions;
  }

  @computedFrom('unconnectedSuggestedRemoteSolutions.length')
  public get unconnectedSuggestedRemoteSolutionsExist(): boolean {
    return this.unconnectedSuggestedRemoteSolutions.length > 0;
  }

  /**
   * Handles the file input for the FileSystem Solutions.
   * @param event A event that holds the files that were "uploaded" by the user.
   * Currently there is no type for this kind of event.
   */
  public async onSolutionInputChange(event: IInputEvent): Promise<void> {
    const uri: string = event.target.files[0].path;
    this.solutionInput.value = '';

    this.openSolutionOrDisplayError(uri);
  }

  /**
   * Handles the file input change event for the open file input.
   * @param event An event that holds the files that were "uploaded" by the user.
   * Currently there is no type for this kind of event.
   */
  public async onOpenDiagramInputChange(event: IInputEvent): Promise<void> {
    const uri: string = event.target.files[0].path;
    this.openDiagramInput.value = '';

    return this.openDiagramOrDisplayError(uri);
  }

  public async openDiagram(): Promise<void> {
    const canNotReadFromFileSystem: boolean = !this.canReadFromFileSystem();
    if (canNotReadFromFileSystem) {
      this.openDiagramInput.click();

      return;
    }

    this.ipcRenderer.send('open_diagram');

    this.ipcRenderer.once('import_opened_diagram', async (event: Event, openedFile: File) => {
      const noFileSelected: boolean = openedFile === null;
      if (noFileSelected) {
        return;
      }

      const filePath: string = openedFile[0];

      await this.openDiagramOrDisplayError(filePath);
    });
  }

  public get uriOfRemoteSolution(): string {
    return `${this.selectedProtocol}${this.uriOfRemoteSolutionWithoutProtocol}`;
  }

  public get uriIsValid(): boolean {
    /**
     * This RegEx checks if the entered URI is valid or not.
     */
    // TODO Check if this still works
    const urlRegEx: RegExp = /^(?:http(s)?:\/\/)+[\w.-]?[\w\-._~:/?#[\]@!$&'()*+,;=.]+$/g;
    const uriIsValid: boolean = urlRegEx.test(this.uriOfRemoteSolution);

    return uriIsValid;
  }

  public get uriIsEmpty(): boolean {
    const uriIsEmtpy: boolean =
      this.uriOfRemoteSolutionWithoutProtocol === undefined || this.uriOfRemoteSolutionWithoutProtocol.length === 0;

    return uriIsEmtpy;
  }

  public async openSolution(): Promise<void> {
    const canNotReadFromFileSystem: boolean = !this.canReadFromFileSystem();
    if (canNotReadFromFileSystem) {
      this.solutionInput.click();

      return;
    }

    this.ipcRenderer.send('open_solution');

    this.ipcRenderer.once('import_opened_solution', async (event: Event, openedFolder: File) => {
      const noFolderSelected: boolean = openedFolder === null;
      if (noFolderSelected) {
        return;
      }

      const folderPath: string = openedFolder[0];
      await this.openSolutionOrDisplayError(folderPath);
    });
  }

  public getBadgeForVersion(version: Version): string {
    switch (version) {
      case Version.Dev:
        return 'remote-solution-badge__dev';
      case Version.Alpha:
        return 'remote-solution-badge__alpha';
      case Version.Beta:
        return 'remote-solution-badge__beta';
      case Version.Stable:
        return 'remote-solution-badge__stable';
      default:
        return 'remote-solution-badge__dev';
    }
  }

  public canReadFromFileSystem(): boolean {
    return (window as any).nodeRequire;
  }

  public selectRemoteSolution(remoteSolutionUri: string): void {
    // tslint:disable-next-line no-magic-numbers
    const protocolEndIndex: number = remoteSolutionUri.indexOf('//') + 2;
    const protocol: string = remoteSolutionUri.substring(0, protocolEndIndex);

    const uri: string = remoteSolutionUri.substring(protocolEndIndex, remoteSolutionUri.length);

    this.selectProtocol(protocol);
    this.uriOfRemoteSolutionWithoutProtocol = uri;
  }

  private startPollingOfRemoteSolutionHistoryStatus(): void {
    this.remoteSolutionHistoryStatusIsPolling = true;
    this.pollRemoteSolutionHistoryStatus();
  }

  private pollRemoteSolutionHistoryStatus(): void {
    this.remoteSolutionHistoryStatusPollingTimer = setTimeout(async () => {
      await this.updateRemoteSolutionHistoryStatus();

      if (!this.remoteSolutionHistoryStatusIsPolling) {
        return;
      }

      this.pollRemoteSolutionHistoryStatus();
    }, environment.processengine.updateRemoteSolutionHistoryIntervalInMs);
  }

  private stopPollingOfRemoteSolutionHistoryStatus(): void {
    const noTimerExisting: boolean = this.remoteSolutionHistoryStatusPollingTimer === undefined;
    if (noTimerExisting) {
      return;
    }

    clearTimeout(this.remoteSolutionHistoryStatusPollingTimer);

    this.remoteSolutionHistoryStatusPollingTimer = undefined;
    this.remoteSolutionHistoryStatusIsPolling = false;
  }

  private async updateRemoteSolutionHistoryStatus(): Promise<void> {
    this.remoteSolutionHistoryWithStatus.forEach(
      async (remoteSolutionWithStatus: RemoteSolutionListEntry): Promise<void> => {
        const remoteSolutionStatus: boolean = await this.isRemoteSolutionActive(remoteSolutionWithStatus.uri);

        this.remoteSolutionHistoryStatus.set(remoteSolutionWithStatus.uri, remoteSolutionStatus);
      },
    );
  }

  private async updateDefaultRemoteSolutions(): Promise<void> {
    this.availableDefaultRemoteSolutions = [];

    const stableRemoteSolution: Promise<RemoteSolutionListEntry | null> = this.searchDefaultRemoteSolutionForVersion(
      Version.Stable,
    );
    const betaRemoteSolution: Promise<RemoteSolutionListEntry | null> = this.searchDefaultRemoteSolutionForVersion(
      Version.Beta,
    );
    const alphaRemoteSolution: Promise<RemoteSolutionListEntry | null> = this.searchDefaultRemoteSolutionForVersion(
      Version.Alpha,
    );
    const devRemoteSolution: Promise<RemoteSolutionListEntry | null> = this.searchDefaultRemoteSolutionForVersion(
      Version.Dev,
    );

    const availableRemoteSolutions: Array<RemoteSolutionListEntry> = await Promise.all([
      stableRemoteSolution,
      betaRemoteSolution,
      alphaRemoteSolution,
      devRemoteSolution,
    ]);

    this.availableDefaultRemoteSolutions = availableRemoteSolutions.filter(
      (remoteSolution: RemoteSolutionListEntry | null) => {
        return remoteSolution !== null;
      },
    );
  }

  private async searchDefaultRemoteSolutionForVersion(version: Version): Promise<RemoteSolutionListEntry | null> {
    const portsToCheck: Array<number> = this.getDefaultPortsFor(version);

    const processEngineUri: string = await this.getActiveProcessEngineForPortList(portsToCheck);

    const noActiveProcessEngineFound: boolean = processEngineUri === null;
    if (noActiveProcessEngineFound) {
      return null;
    }

    return {
      uri: processEngineUri,
      status: true,
      version: version,
    };
  }

  private async getActiveProcessEngineForPortList(portsToCheck: Array<number>): Promise<string | null> {
    for (const port of portsToCheck) {
      const uriToCheck: string = `http://localhost:${port}`;
      const processEngineFound: boolean = await this.isRemoteSolutionActive(uriToCheck);

      if (processEngineFound) {
        return uriToCheck;
      }
    }

    return null;
  }

  private getDefaultPortsFor(version: Version): Array<number> {
    switch (version) {
      case Version.Dev:
        return this.getPortList(56300);
      case Version.Alpha:
        return this.getPortList(56200);
      case Version.Beta:
        return this.getPortList(56100);
      case Version.Stable:
        return this.getPortList(56000);
      default:
        return [];
    }
  }

  private getPortList(port: number): Array<number> {
    const portList = [];

    for (let index = 0; index < 10; index++) {
      portList.push(port + index * 10);
    }

    return portList;
  }

  private async isRemoteSolutionActive(remoteSolutionUri: string): Promise<boolean> {
    try {
      const response: Response = await fetch(remoteSolutionUri);

      const data: JSON = await response.json();

      const isResponseFromProcessEngine: boolean = data['name'] === '@process-engine/process_engine_runtime';
      if (!isResponseFromProcessEngine) {
        throw new Error('The response was not send by a ProcessEngine.');
      }

      return true;
    } catch {
      return false;
    }
  }

  private async refreshSolutions(): Promise<void> {
    return this.solutionExplorerList.refreshSolutions();
  }

  private async openSolutionOrDisplayError(uri: string): Promise<void> {
    try {
      await this.solutionExplorerList.openSolution(uri);
    } catch (error) {
      this.notificationService.showNotification(NotificationType.ERROR, error.message);
    }
  }

  private loadRemoteSolutionHistory(): Array<string> {
    const remoteSolutionHistoryFromLocalStorage: string | null = localStorage.getItem('remoteSolutionHistory');
    const noHistoryExisting: boolean = remoteSolutionHistoryFromLocalStorage === null;
    const remoteSolutionHistory: Array<string> = noHistoryExisting
      ? []
      : JSON.parse(remoteSolutionHistoryFromLocalStorage);

    return remoteSolutionHistory;
  }

  private saveRemoteSolutionHistory(remoteSolutionHistory: Array<string>): void {
    const remoteSolutionHistoryString: string = JSON.stringify(remoteSolutionHistory);

    localStorage.setItem('remoteSolutionHistory', remoteSolutionHistoryString);
  }

  private addSolutionToRemoteSolutionHistory(solutionUri: string): void {
    this.removeSolutionFromSolutionHistroy(solutionUri);

    const remoteSolutionHistory: Array<string> = this.loadRemoteSolutionHistory();

    remoteSolutionHistory.push(solutionUri);

    this.saveRemoteSolutionHistory(remoteSolutionHistory);
  }

  private removeSolutionFromSolutionHistroy(solutionUri: string): void {
    const remoteSolutionHistory: Array<string> = this.loadRemoteSolutionHistory();

    const uniqueRemoteSolutionHistory: Array<string> = remoteSolutionHistory.filter((remoteSolutionUri: string) => {
      return remoteSolutionUri !== solutionUri;
    });

    this.saveRemoteSolutionHistory(uniqueRemoteSolutionHistory);
  }

  private async openDiagramOrDisplayError(uri: string): Promise<void> {
    try {
      const openedDiagram: IDiagram = await this.solutionExplorerList.openDiagram(uri);
      const solution: ISolutionEntry = this.solutionExplorerList.getOpenDiagramSolutionEntry();

      this.solutionService.addOpenDiagram(openedDiagram);

      await this.navigateToDetailView(openedDiagram, solution);
    } catch (error) {
      // The diagram may already be opened.
      const diagram: IDiagram | null = await this.solutionExplorerList.getOpenedDiagramByURI(uri);
      const solution: ISolutionEntry = this.solutionExplorerList.getOpenDiagramSolutionEntry();

      const diagramWithURIIsAlreadyOpened: boolean = diagram !== null;
      if (diagramWithURIIsAlreadyOpened) {
        return this.navigateToDetailView(diagram, solution);
      }

      this.notificationService.showNotification(NotificationType.ERROR, error.message);
    }

    return undefined;
  }

  private electronFileOpeningHook = async (_: Event, pathToFile: string): Promise<void> => {
    const uri: string = pathToFile;
    this.openDiagramOrDisplayError(uri);
  };

  private electronOnMenuOpenDiagramHook = async (_: Event): Promise<void> => {
    this.openDiagram();
  };

  private electronOnMenuOpenSolutionHook = async (_: Event): Promise<void> => {
    this.openSolution();
  };

  private electronOnCreateDiagram = async (_: Event): Promise<void> => {
    this.openNewDiagram();
  };

  private openNewDiagram(): void {
    const uri: string = 'about:open-diagrams';

    this.solutionExplorerList.createDiagram(uri);
  }

  private createNewDiagram(): void {
    const activeSolutionUri: string = this.router.currentInstruction.queryParams.solutionUri;
    const activeSolution: ISolutionEntry = this.solutionService.getSolutionEntryForUri(activeSolutionUri);

    const activeSolutionCanCreateDiagrams: boolean =
      activeSolution !== undefined && !activeSolution.uri.startsWith('http');

    const uri: string = activeSolutionCanCreateDiagrams ? activeSolutionUri : 'about:open-diagrams';

    this.solutionExplorerList.createDiagram(uri);
  }

  private registerElectronHooks(): void {
    // Register handler for double-click event fired from "electron.js".
    this.ipcRenderer.on('double-click-on-file', this.electronFileOpeningHook);

    this.ipcRenderer.on('menubar__start_opening_diagram', this.electronOnMenuOpenDiagramHook);
    this.ipcRenderer.on('menubar__start_opening_solution', this.electronOnMenuOpenSolutionHook);

    this.ipcRenderer.on('menubar__start_create_diagram', this.electronOnCreateDiagram);

    // Send event to signal the component is ready to handle the event.
    this.ipcRenderer.send('waiting-for-double-file-click');

    // Check if there was a double click before BPMN Studio was loaded.
    const fileInfo: IFile = this.ipcRenderer.sendSync('get_opened_file');

    if (fileInfo.path) {
      // There was a file opened before BPMN Studio was loaded, open it.
      const uri: string = fileInfo.path;
      this.openDiagramOrDisplayError(uri);
    }
  }

  private removeElectronFileOpeningHooks(): void {
    // Register handler for double-click event fired from "electron.js".
    this.ipcRenderer.removeListener('double-click-on-file', this.electronFileOpeningHook);

    this.ipcRenderer.removeListener('menubar__start_opening_diagram', this.electronOnMenuOpenDiagramHook);
    this.ipcRenderer.removeListener('menubar__start_opening_solution', this.electronOnMenuOpenSolutionHook);

    this.ipcRenderer.removeListener('menubar__start_create_diagram', this.electronOnCreateDiagram);
  }

  private openDiagramOnDropBehaviour: EventListener = async (event: DragEvent): Promise<void> => {
    event.preventDefault();

    const loadedFiles: FileList = event.dataTransfer.files;

    const urisToOpen: Array<string> = Array.from(loadedFiles).map((file: IFile): string => {
      return file.path;
    });

    const openingPromises: Array<Promise<void>> = urisToOpen.map(
      (uri: string): Promise<void> => {
        return this.openDiagramOrDisplayError(uri);
      },
    );

    await Promise.all(openingPromises);
  };

  // TODO: This method is copied all over the place.
  private async navigateToDetailView(diagram: IDiagram, solution: ISolutionEntry): Promise<void> {
    await this.router.navigateToRoute('design', {
      diagramName: diagram.name,
      diagramUri: diagram.uri,
      solutionUri: solution.uri,
    });
  }
}
