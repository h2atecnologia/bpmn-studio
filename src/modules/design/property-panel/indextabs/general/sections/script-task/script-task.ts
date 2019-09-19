import {EventAggregator} from 'aurelia-event-aggregator';
import {inject} from 'aurelia-framework';

import {IScriptTaskElement, IShape} from '@process-engine/bpmn-elements_contracts';

import {IPageModel, ISection} from '../../../../../../../contracts';
import environment from '../../../../../../../environment';

@inject(EventAggregator)
export class ScriptTaskSection implements ISection {
  public path: string = '/sections/script-task/script-task';
  public canHandleElement: boolean = false;
  public businessObjInPanel: IScriptTaskElement;

  public showModal: boolean = false;

  public scriptInput: HTMLElement;

  private eventAggregator: EventAggregator;

  constructor(eventAggregator?: EventAggregator) {
    this.eventAggregator = eventAggregator;
  }

  public activate(model: IPageModel): void {
    this.businessObjInPanel = model.elementInPanel.businessObject;
  }

  public attached(): void {
    this.recoverInputHeight();

    this.saveInputHeightOnChange();
  }

  public detached(): void {
    this.scriptInput.removeEventListener('mousedown', this.saveInputHeightOnMouseUp);
  }

  public isSuitableForElement(element: IShape): boolean {
    return this.elementIsScriptTask(element);
  }

  public updateScript(): void {
    this.publishDiagramChange();
  }

  private elementIsScriptTask(element: IShape): boolean {
    return (
      element !== undefined &&
      element.businessObject !== undefined &&
      element.businessObject.$type === 'bpmn:ScriptTask'
    );
  }

  private saveInputHeightOnChange(): void {
    this.scriptInput.addEventListener('mousedown', this.saveInputHeightOnMouseUp);
  }

  private recoverInputHeight(): void {
    this.scriptInput.style.height = `${localStorage.getItem('scriptTaskInputHeight')}px`;
  }

  private saveInputHeightOnMouseUp: EventListenerOrEventListenerObject = () => {
    const resizeListenerFunction: EventListenerOrEventListenerObject = (): void => {
      localStorage.setItem('scriptTaskInputHeight', this.scriptInput.clientHeight.toString());
      window.removeEventListener('mouseup', resizeListenerFunction);
    };
    window.addEventListener('mouseup', resizeListenerFunction);
  };

  private publishDiagramChange(): void {
    this.eventAggregator.publish(environment.events.diagramChange);
  }
}
