/* eslint-disable no-useless-escape */
/* eslint-disable no-empty-function */
import path from 'path';
import fs from 'fs';
import os from 'os';
import {exec} from 'child_process';

import {AppConstructorOptions, Application} from 'spectron';
import assert from 'assert';
import {IIdentity} from '@essential-projects/iam_contracts';

function getUserConfigFolder(): string {
  const userHomeDir = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(userHomeDir, 'Library', 'Application Support');
    case 'win32':
      return path.join(userHomeDir, 'AppData', 'Roaming');
    default:
      return path.join(userHomeDir, '.config');
  }
}

const APP_BASE_URL = `file://${__dirname}/../../index.html`;
const DATABASE_PATH = path.join(getUserConfigFolder(), 'bpmn-studio-tests', 'process_engine_databases');
const SAVE_DIAGRAM_DIR = path.join(getUserConfigFolder(), 'bpmn-studio-tests', 'saved_diagrams');

export class TestClient {
  private app: Application;

  constructor(applicationArgs: AppConstructorOptions) {
    this.app = new Application(applicationArgs);
  }

  public async awaitReadyness(): Promise<void> {
    await this.app.client.waitUntilWindowLoaded();
    await this.app.browserWindow.isVisible();
  }

  public async showSolutionExplorer(): Promise<void> {
    const solutionExplorerIsVisible = await this.webdriverClient.isVisible('[data-test-solution-explorer-panel]');
    if (solutionExplorerIsVisible) {
      return;
    }

    await this.ensureVisible('[data-test-toggle-solution-explorer]');
    await this.clickOn('[data-test-toggle-solution-explorer]');
    await this.ensureVisible('[data-test-solution-explorer-panel]');
  }

  public async hideSolutionExplorer(): Promise<void> {
    const solutionExplorerIsVisible = await this.webdriverClient.isVisible('[data-test-solution-explorer-panel]');
    const solutionExplorerIsHidden = !solutionExplorerIsVisible;
    if (solutionExplorerIsHidden) {
      return;
    }

    await this.ensureVisible('[data-test-toggle-solution-explorer]');
    await this.clickOn('[data-test-toggle-solution-explorer]');
    await this.ensureNotVisible('[data-test-solution-explorer-panel]');
  }

  public async assertInternalProcessEngineIsOpenedAsSolution(): Promise<void> {
    await this.ensureVisible('[data-test-solution-is-internal=true]');
  }

  public async openDirectoryAsSolution(dir: string, diagramName?: string): Promise<void> {
    const pathToSolution: string = path.join(__dirname, '..', '..', dir);

    await this.webdriverClient.executeAsync(
      async (solutionPath, solutionIdentity, done) => {
        // eslint-disable-next-line no-underscore-dangle
        await (window as any).__dangerouslyInvoke.openSolution(solutionPath, false, solutionIdentity);

        done();
      },
      pathToSolution,
      this.getDefaultIdentity(),
    );

    await this.ensureVisible(`[data-test-solution-entry-name=${dir}]`);

    if (diagramName) {
      const searchString = this.getUriForSelector(pathToSolution, diagramName);
      await this.ensureVisible(`[data-test-open-diagram-with-uri*="${searchString}"]`);
      await this.clickOn(`[data-test-open-diagram-with-uri*="${searchString}"]`);
    }
  }

  public async createAndOpenNewDiagram(): Promise<void> {
    await this.ensureVisible('[data-test-create-new-diagram]');
    await this.clickOn('[data-test-create-new-diagram]');
    await this.ensureVisible('[data-test-navbar-title]');
  }

  public async startProcess(): Promise<void> {
    await this.ensureVisible('[data-test-start-diagram-button]');
    await this.clickOn('[data-test-start-diagram-button]');
    await this.ensureVisible('[data-test-live-execution-tracker]');
  }

  public async stopProcess(): Promise<void> {
    await this.ensureVisible('[data-test-stop-process-button]');
    await this.clickOn('[data-test-stop-process-button]');
    await this.ensureNotVisible('[data-test-stop-process-button]');
  }

  public async deployDiagram(): Promise<void> {
    await this.ensureVisible('[data-test-deploy-diagram-button]');
    await this.clickOn('[data-test-deploy-diagram-button]');
  }

  public async startPageLoaded(): Promise<void> {
    await this.ensureVisible('[data-test-start-page]');
  }

  public async clearDatabase(): Promise<void> {
    await this.execCommand(`rm -rf ${DATABASE_PATH.replace(/\s/g, '\\ ')}`);
  }

  public async clearSavedDiagrams(): Promise<void> {
    await this.execCommand(`rm -rf ${SAVE_DIAGRAM_DIR.replace(/\s/g, '\\ ')}`);
  }

  public async assertDiagramIsOnFileSystem(): Promise<void> {
    await this.ensureVisible('[data-test-navbar-icon]');
    const classAttribute = await this.getAttributeFromElement('[data-test-navbar-icon]', 'data-test-navbar-icon');

    assert.equal(classAttribute, 'false');
  }

  public async assertDiagramIsOnProcessEngine(): Promise<void> {
    await this.ensureVisible('[data-test-navbar-icon]');
    const classAttribute = await this.getAttributeFromElement('[data-test-navbar-icon]', 'data-test-navbar-icon');

    assert.equal(classAttribute, 'true');
  }

  public async saveDiagramAs(fileName: string): Promise<void> {
    const fileUri: string = path.join(SAVE_DIAGRAM_DIR, fileName);
    const directoryExists: boolean = await fs.existsSync(SAVE_DIAGRAM_DIR);

    if (!directoryExists) {
      fs.mkdirSync(SAVE_DIAGRAM_DIR);
    }

    await this.webdriverClient.executeAsync(async (pathToSave, done) => {
      // eslint-disable-next-line no-underscore-dangle
      await (window as any).__dangerouslyInvoke.saveDiagramAs(pathToSave);

      done();
    }, fileUri);
  }

  public async assertDiagramIsSaved(): Promise<void> {
    await this.ensureNotVisible('[data-test-edited-label]');
  }

  public async assertDiagramIsUnsaved(): Promise<void> {
    await this.ensureVisible('[data-test-edited-label]');
  }

  // openDesignViewForCurrentDiagram?
  public async openDesignViewFromStatusbar(): Promise<void> {
    await this.ensureVisible('[data-test-status-bar-disable-xml-view-button]');
    await this.clickOn('[data-test-status-bar-disable-xml-view-button]');
    await this.ensureVisible('[data-test-diagram-detail]');
  }

  public async assertXmlContainsText(text: string): Promise<void> {
    const xmlViewContent = await this.getTextFromElement('[data-test-xml-view-content]');
    const xmlViewContentContainsText: boolean = xmlViewContent.includes(text);

    assert.equal(xmlViewContentContainsText, true);
  }

  // openXMLViewForCurrentDiagram?
  public async openXmlViewFromStatusbar(): Promise<void> {
    await this.ensureVisible('[data-test-status-bar-xml-view-button]');
    await this.clickOn('[data-test-status-bar-xml-view-button]');
    await this.ensureVisible('[data-test-bpmn-xml-view]');
  }

  public async clickOnBpmnElementWithName(name): Promise<void> {
    await this.ensureVisible(`.djs-label=${name}`);
    await this.clickOn(`.djs-label=${name}`);
  }

  public async assertWindowTitleIs(name): Promise<void> {
    const windowTitle = await this.webdriverClient.getTitle();

    assert.equal(windowTitle, name);
  }

  public async assertNavbarTitleIs(name): Promise<void> {
    await this.ensureVisible('[data-test-navbar-title]');
    const navbarTitle = await this.getTextFromElement('[data-test-navbar-title]');

    assert.equal(navbarTitle, name);
  }

  public async assertSelectedBpmnElementHasName(name): Promise<void> {
    const selectedElementText = await this.getValueFromElement('[data-test-property-panel-element-name]');

    assert.equal(selectedElementText, name);
  }

  public async rejectSelectedBpmnElementHasName(name): Promise<void> {
    const selectedElementText = await this.getValueFromElement('[data-test-property-panel-element-name]');

    assert.notEqual(selectedElementText, name);
  }

  public async showPropertyPanel(): Promise<void> {
    const propertyPanelIsVisible = await this.webdriverClient.isVisible('[data-test-property-panel]');
    if (propertyPanelIsVisible) {
      return;
    }

    await this.ensureVisible('[data-test-toggle-propertypanel]');
    await this.clickOn('[data-test-toggle-propertypanel]');
  }

  public async hidePropertyPanel(): Promise<void> {
    const propertyPanelIsVisible = await this.webdriverClient.isVisible('[data-test-property-panel]');
    const propertyPanelIsHidden = !propertyPanelIsVisible;
    if (propertyPanelIsHidden) {
      return;
    }

    await this.ensureVisible('[data-test-toggle-propertypanel]');
    await this.clickOn('[data-test-toggle-propertypanel]');
  }

  public async getElement(selector): Promise<any> {
    return this.webdriverClient.element(selector);
  }

  public async getElements(selector): Promise<any> {
    return this.webdriverClient.elements(selector);
  }

  public async openStartPage(): Promise<void> {
    return this.openView('');
  }

  public async assertCanvasModelIsVisible(): Promise<void> {
    const canvasModelIsVisible = await this.webdriverClient.isVisible('[data-test-canvas-model]');
    assert.equal(canvasModelIsVisible, true);
  }

  public async assertXmlViewHasContent(): Promise<void> {
    const xmlViewContent = await this.getTextFromElement('[data-test-xml-view-content]');
    assert.notEqual(xmlViewContent, null);
  }

  public async assertDiffViewHasRenderedAllContainer(): Promise<void> {
    const leftDiffViewContainerIsVisible = await this.webdriverClient.isVisible('[data-test-left-diff-view]');
    const rightDiffViewContainerIsVisible = await this.webdriverClient.isVisible('[data-test-right-diff-view]');
    const lowerDiffViewContainerIsVisible = await this.webdriverClient.isVisible('[data-test-lower-diff-view]');

    assert.equal(leftDiffViewContainerIsVisible, true);
    assert.equal(rightDiffViewContainerIsVisible, true);
    assert.equal(lowerDiffViewContainerIsVisible, true);
  }

  public async openDesignViewForDiagram(diagramName: string, diagramUri: string, solutionUri?: string): Promise<void> {
    await this.openDesignView('detail', diagramName, diagramUri, solutionUri);
    await this.ensureVisible('[data-test-diagram-detail]');
  }

  public async openXmlViewForDiagram(diagramName: string, diagramUri: string, solutionUri?: string): Promise<void> {
    await this.openDesignView('xml', diagramName, diagramUri, solutionUri);
    await this.ensureVisible('[data-test-bpmn-xml-view]');
  }

  public async openDiffViewForDiagram(diagramName: string, diagramUri: string, solutionUri?: string): Promise<void> {
    await this.openDesignView('diff', diagramName, diagramUri, solutionUri);
    await this.ensureVisible('[data-test-bpmn-diff-view]');
  }

  public async openThinkView(diagramName?: string, diagramUri?: string, solutionUri?: string): Promise<void> {
    if (diagramName && diagramUri) {
      const encodedName = encodeURIComponent(diagramName);
      const encodedUri = encodeURIComponent(diagramUri);
      const encodedSolutionUri = solutionUri ? encodeURIComponent(solutionUri) : '';
      const uriFragment = `#/think/diagram-list/diagram/${encodedName}?diagramUri=${encodedUri}&solutionUri=${encodedSolutionUri}`;

      await this.openView(uriFragment);
    } else {
      await this.openView('#/think/diagram-list/diagram');
    }

    await this.ensureVisible('diagram-list');
  }

  public async openThinkViewFromNavbar(): Promise<void> {
    await this.ensureVisible('[data-test-navbar="Think"]');
    await this.clickOn('[data-test-navbar="Think"]');
    await this.ensureVisible('diagram-list');
  }

  public async getAttributeFromElement(selector, attribute): Promise<string> {
    return this.webdriverClient.getAttribute(selector, attribute);
  }

  public async getTextFromElement(selector): Promise<string> {
    return this.webdriverClient.getText(selector);
  }

  public async getValueFromElement(selector): Promise<string> {
    return this.webdriverClient.getValue(selector);
  }

  public async elementHasText(selector, text): Promise<void> {
    return this.webdriverClient.waitUntilTextExists(selector, text);
  }

  public async ensureVisible(selector: string, timeout?: number): Promise<boolean> {
    return this.webdriverClient.waitForVisible(selector, timeout);
  }

  public async ensureNotVisible(selector: string): Promise<boolean> {
    const collection = await this.webdriverClient.elements(selector);

    return collection.value.length === 0;
  }

  public async clickOn(selector: string): Promise<any> {
    return this.webdriverClient.$(selector).leftClick();
  }

  public async pause(timeInMilliseconds: number): Promise<void> {
    await new Promise((c: Function): any => setTimeout(c, timeInMilliseconds));
  }

  public async startSpectronApp(): Promise<Application> {
    return this.app.start();
  }

  public async isSpectronAppRunning(): Promise<boolean> {
    return this.app.isRunning();
  }

  public async stopSpectronApp(): Promise<Application> {
    return this.app.stop();
  }

  private getDefaultIdentity(): IIdentity {
    const identity = {
      token: 'ZHVtbXlfdG9rZW4=',
      userId: '',
    };

    return identity;
  }

  private get webdriverClient(): any {
    return this.app.client;
  }

  private async openView(uriPath: string): Promise<void> {
    return this.app.browserWindow.loadURL(`${APP_BASE_URL}${uriPath}`);
  }

  private async openDesignView(
    subPath: string,
    diagramName: string,
    diagramUri: string,
    solutionUri?: string,
  ): Promise<void> {
    const encodedName = encodeURIComponent(diagramName);
    const encodedUri = encodeURIComponent(diagramUri);
    const encodedSolutionUri = solutionUri ? encodeURIComponent(solutionUri) : '';
    const uriFragment = `#/design/${subPath}/diagram/${encodedName}?diagramUri=${encodedUri}&solutionUri=${encodedSolutionUri}`;

    return this.openView(uriFragment);
  }

  private async execCommand(command: string): Promise<any> {
    return new Promise((resolve: Function, reject: Function): any => {
      exec(command, (err, stdin, stderr) => {
        if (err || stderr) {
          reject(err, stderr);
        }
        return resolve(stdin);
      });
    });
  }

  private getUriForSelector(pathToSolution: string, diagramName: string): string {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const searchString: string = `${pathToSolution}\\${diagramName}`;
      const replacedSearchString = searchString.replace(/[\\]/gm, '\\\\');

      return replacedSearchString;
    }

    return `${pathToSolution}/${diagramName}`;
  }
}