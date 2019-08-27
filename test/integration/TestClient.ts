/* eslint-disable no-useless-escape */
/* eslint-disable no-empty-function */
import url from 'url';

import {Application, SpectronWebContents} from 'spectron';
import assert from 'assert';

export class TestClient {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public async awaitReadyness(): Promise<void> {
    await this.app.client.waitUntilWindowLoaded();
    await this.app.browserWindow.isVisible();
  }

  // openDesignViewForCurrentDiagram?
  public async openDesignViewFromStatusbar(): Promise<void> {
    await this.ensureVisible('[data-test-status-bar-disable-xml-view-button]');
    await this.clickOn('[data-test-status-bar-disable-xml-view-button]');
    await this.ensureVisible('diagram-detail');
  }

  // openXMLViewForCurrentDiagram?
  public async openXMLViewFromStatusbar(): Promise<void> {
    await this.ensureVisible('[data-test-status-bar-xml-view-button]');
    await this.clickOn('[data-test-status-bar-xml-view-button]');
    await this.ensureVisible('bpmn-xml-view');
  }

  public async clickOnBPMNElementWithName(name): Promise<void> {
    await this.clickOn(`.djs-label=${name}`);
  }

  public async assertWindowTitleIs(name): Promise<void> {
    const windowTitle = await this.webdriverClient.getTitle();

    assert.equal(windowTitle, name);
  }

  public async assertNavbarTitleIs(name): Promise<void> {
    const navbarTitle = await this.getTextFromElement('.process-details-title');

    assert.equal(navbarTitle, name);
  }

  public async assertSelectedBPMNElementHasName(name): Promise<void> {
    const selectedElementText = await this.getValueFromElement('[data-test-pp-element-name]');

    assert.equal(selectedElementText, name);
  }

  public async assertSelectedBPMNElementHasNotName(name): Promise<void> {
    const selectedElementText = await this.getValueFromElement('[data-test-pp-element-name]');

    assert.notEqual(selectedElementText, name);
  }

  public async showPropertyPanel(): Promise<void> {
    const propertyPanelIsVisible = await this.webdriverClient.isVisible('property-panel');
    if (propertyPanelIsVisible) {
      return;
    }

    await this.ensureVisible('[data-test-toggle-propertypanel]');
    await this.clickOn('[data-test-toggle-propertypanel]');
  }

  public async hidePropertyPanel(): Promise<void> {
    const propertyPanelIsHidden = !(await this.webdriverClient.isVisible('property-panel'));
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
    return this.app.browserWindow.loadURL(`file://${__dirname}/../../index.html`);
  }

  public async openDesignViewForDiagram(diagramName, diagramUri, solutionUri?): Promise<void> {
    const unformattedURL = `file://${__dirname}/../../index.html#/design/detail/diagram/${diagramName}?diagramUri=${diagramUri}&solutionUri=${solutionUri}`;
    const formattedURL = url.format(unformattedURL);

    await this.app.browserWindow.loadURL(formattedURL);
    await this.ensureVisible('diagram-detail');
  }

  public async openXMLViewForDiagram(diagramName, diagramUri, solutionUri?): Promise<void> {
    const unformattedURL = `file://${__dirname}/../../index.html#/design/xml/diagram/${diagramName}?diagramUri=${diagramUri}&solutionUri=${solutionUri}`;
    const formattedURL = url.format(unformattedURL);

    await this.app.browserWindow.loadURL(formattedURL);
    await this.ensureVisible('bpmn-xml-view');
  }

  public async openDiffViewForDiagram(diagramName, diagramUri, solutionUri?): Promise<void> {
    const unformattedURL = `file://${__dirname}/../../index.html#/design/diff/diagram/${diagramName}?diagramUri=${diagramUri}&solutionUri=${solutionUri}`;
    const formattedURL = url.format(unformattedURL);

    await this.app.browserWindow.loadURL(formattedURL);
    await this.ensureVisible('bpmn-diff-view');
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
    return this.app.client.waitUntilTextExists(selector, text);
  }

  public async ensureVisible(selector: string): Promise<boolean> {
    return this.webdriverClient.waitForVisible(selector);
  }

  public async ensureNotVisible(selector: string): Promise<boolean> {
    const collection = await this.webdriverClient.elements(selector);

    return collection.value.length === 0;
  }

  public async clickOn(selector: string): Promise<any> {
    return this.webdriverClient.$(selector).leftClick();
  }

  public async sendKeyboardInput(keys): Promise<void> {
    const webContents = this.getWebContents();

    for (const key of keys) {
      const eventOptsArray = this.getEventsForKeystrokes(key);

      for (const eventOpts of eventOptsArray) {
        for (const type of ['keydown', 'char', 'keyup']) {
          const typeOpts = {type};
          const opts = {...typeOpts, ...eventOpts};

          webContents.sendInputEvent(opts);
        }

        await this.pause(50);
      }
    }
  }

  public async pause(timeInMilliseconds: number): Promise<void> {
    await new Promise((c: any): any => setTimeout(c, timeInMilliseconds));
  }

  private getWebContents(): SpectronWebContents {
    return this.app.webContents;
  }

  public getEventsForKeystrokes(keystrokes: string): Array<any> {
    if (keystrokes === ' ') {
      return [this.getOptionsForKey(' ')];
    }

    return keystrokes.split(' ').map((keystroke) => {
      const keys = keystroke.split('-');
      const options = keys.reduce((memo: any, key: string) => {
        memo = memo || {};
        const opts = this.getOptionsForKey(key);
        const result = {...memo, ...opts};
        const modifiers = memo.modifiers || [];

        result.modifiers = modifiers.concat(opts.modifiers);

        return result;
      }, {});

      return options;
    });
  }

  public getOptionsForKey(key): any {
    const opts: any = {modifiers: []};

    if (key === 'cmd' || key === 'meta') {
      opts.modifiers.push('cmd');
    }
    if (key === 'ctrl') {
      opts.modifiers.push('ctrl');
    }
    if (key === 'shift') {
      opts.modifiers.push('shift');
    }
    if (key === 'alt') {
      opts.modifiers.push('alt');
    }
    if (key === 'space') {
      opts.key = ' ';
    }

    if (!opts.key) {
      opts.key = key;
    }
    if (!opts.keyCode) {
      opts.keyCode = opts.key;
    }

    return opts;
  }

  public get webdriverClient(): any {
    return this.app.client;
  }
}
