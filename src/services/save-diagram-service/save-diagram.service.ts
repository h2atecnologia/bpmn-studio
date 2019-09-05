import {EventAggregator} from 'aurelia-event-aggregator';
import {inject} from 'aurelia-framework';
import {Router} from 'aurelia-router';

import {IDiagram} from '@process-engine/solutionexplorer.contracts';

import {DiagramStateChange, IDiagramState, ISolutionEntry, NotificationType} from '../../contracts/index';
import environment from '../../environment';
import {NotificationService} from '../notification-service/notification.service';
import {OpenDiagramsSolutionExplorerService} from '../solution-explorer-services/OpenDiagramsSolutionExplorerService';
import {SolutionService} from '../solution-service/SolutionService';
import {OpenDiagramStateService} from '../solution-explorer-services/OpenDiagramStateService';

@inject(EventAggregator, NotificationService, 'OpenDiagramService', 'SolutionService', Router, OpenDiagramStateService)
export class SaveDiagramService {
  private eventAggregator: EventAggregator;
  private notificationService: NotificationService;
  private openDiagramStateService: OpenDiagramStateService;
  private openDiagramService: OpenDiagramsSolutionExplorerService;
  private solutionService: SolutionService;
  private router: Router;
  private ipcRenderer: any;

  private isSaving: boolean = false;

  constructor(
    eventAggregator: EventAggregator,
    notificationService: NotificationService,
    openDiagramService: OpenDiagramsSolutionExplorerService,
    solutionService: SolutionService,
    router: Router,
    openDiagramStateService: OpenDiagramStateService,
  ) {
    this.eventAggregator = eventAggregator;
    this.notificationService = notificationService;
    this.openDiagramService = openDiagramService;
    this.solutionService = solutionService;
    this.router = router;
    this.openDiagramStateService = openDiagramStateService;

    const isRunningInElectron: boolean = Boolean((window as any).nodeRequire);
    if (isRunningInElectron) {
      this.ipcRenderer = (window as any).nodeRequire('electron').ipcRenderer;
    }
  }

  /**
   * Saves the current diagram.
   */
  public async saveDiagram(solutionToSaveTo: ISolutionEntry, diagramToSave: IDiagram, xml: string): Promise<void> {
    if (this.isSaving) {
      return;
    }
    this.isSaving = true;

    const savingTargetIsRemoteSolution: boolean = solutionToSaveTo.uri.startsWith('http');
    if (savingTargetIsRemoteSolution) {
      setTimeout(() => {
        this.isSaving = false;
      }, 500);

      return;
    }

    const diagramIsUnsavedDiagram: boolean = diagramToSave.uri.startsWith('about:open-diagrams');
    if (diagramIsUnsavedDiagram) {
      this.isSaving = false;

      await this.saveDiagramAs(solutionToSaveTo, diagramToSave, xml);

      return;
    }

    try {
      diagramToSave.xml = xml;

      this.openDiagramStateService.setDiagramChange(diagramToSave.uri, {
        change: 'save',
        xml: xml,
      });

      await solutionToSaveTo.service.saveDiagram(diagramToSave);

      this.eventAggregator.publish(environment.events.navBar.diagramChangesResolved);
    } catch (error) {
      this.notificationService.showNotification(NotificationType.ERROR, `Unable to save the file: ${error}.`);

      setTimeout(() => {
        this.isSaving = false;
      }, 500);

      throw error;
    }
  }

  public async saveDiagramAs(
    solutionToSaveTo: ISolutionEntry,
    diagramToSave: IDiagram,
    xml: string,
    path?: string,
  ): Promise<void> {
    const isRemoteSolution: boolean = diagramToSave.uri.startsWith('http');
    if (isRemoteSolution || this.isSaving) {
      return;
    }

    this.isSaving = true;

    const pathIsSet: boolean = path !== undefined;
    const pathToSaveTo: string = pathIsSet ? path : await this.getPathToSaveTo();

    const diagramIsUnsaved: boolean = diagramToSave.uri.startsWith('about:open-diagrams');
    if (diagramIsUnsaved) {
      const lastIndexOfSlash: number = pathToSaveTo.lastIndexOf('/');
      const lastIndexOfBackSlash: number = pathToSaveTo.lastIndexOf('\\');
      const indexBeforeFilename: number = Math.max(lastIndexOfSlash, lastIndexOfBackSlash) + 1;

      const filename: string = pathToSaveTo.slice(indexBeforeFilename, pathToSaveTo.length).replace('.bpmn', '');

      const temporaryDiagramName: string = diagramToSave.uri.replace('about:open-diagrams/', '').replace('.bpmn', '');

      xml = xml.replace(new RegExp(temporaryDiagramName, 'g'), filename);
    }

    const diagram: IDiagram = {
      name: diagramToSave.name,
      id: diagramToSave.id,
      uri: diagramToSave.uri,
      xml: xml,
    };

    try {
      await solutionToSaveTo.service.saveDiagram(diagram, pathToSaveTo);

      const diagramChange: Array<DiagramStateChange> = [{change: 'save', xml: diagram.xml}];
      const previousDiagramsState: IDiagramState | null = this.openDiagramStateService.loadDiagramState(diagram.uri);

      const previousDiagramHasState: boolean = previousDiagramsState !== null;
      if (previousDiagramHasState) {
        previousDiagramsState.metadata.changes = diagramChange;

        this.openDiagramStateService.updateDiagramState(path, previousDiagramsState);
      } else {
        this.openDiagramStateService.saveDiagramState(path, diagram.xml, undefined, undefined, false);
      }

      this.eventAggregator.publish(environment.events.navBar.diagramChangesResolved);
    } catch (error) {
      this.notificationService.showNotification(NotificationType.ERROR, `Unable to save the file: ${error}.`);

      setTimeout(() => {
        this.isSaving = false;
      }, 500);

      throw error;
    }

    await this.openDiagramService.closeDiagram(diagramToSave);
    this.solutionService.removeOpenDiagramByUri(diagramToSave.uri);

    try {
      diagramToSave = await this.openDiagramService.openDiagram(pathToSaveTo, solutionToSaveTo.identity);
      this.solutionService.addOpenDiagram(diagramToSave);
    } catch {
      const alreadyOpenedDiagram: IDiagram = await this.openDiagramService.getOpenedDiagramByURI(pathToSaveTo);

      await this.openDiagramService.closeDiagram(alreadyOpenedDiagram);

      diagramToSave = await this.openDiagramService.openDiagram(pathToSaveTo, solutionToSaveTo.identity);
    }

    xml = diagramToSave.xml;
    solutionToSaveTo = this.solutionService.getSolutionEntryForUri('about:open-diagrams');

    await this.router.navigateToRoute('design', {
      diagramName: diagramToSave.name,
      diagramUri: diagramToSave.uri,
      solutionUri: solutionToSaveTo.uri,
    });

    this.eventAggregator.subscribeOnce('router:navigation:success', () => {
      this.eventAggregator.publish(environment.events.navBar.diagramChangesResolved);
    });

    setTimeout(() => {
      this.isSaving = false;
    }, 500);
  }

  private async getPathToSaveTo(): Promise<string> {
    return new Promise((resolve: Function, reject: Function): void => {
      this.ipcRenderer.once('save_diagram_as', async (event: Event, savePath: string) => {
        const noFileSelected: boolean = savePath === null;
        if (noFileSelected) {
          reject(new Error('No file was selected.'));
        }

        resolve(savePath);
      });

      this.ipcRenderer.send('open_save-diagram-as_dialog');
    });
  }
}
