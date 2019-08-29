import {EventAggregator} from 'aurelia-event-aggregator';
import {inject} from 'aurelia-framework';
import {ValidateEvent, ValidationController, ValidationRules} from 'aurelia-validation';

import {IModdleElement, IShape} from '@process-engine/bpmn-elements_contracts';

import {
  IBpmnModdle,
  IBpmnModeler,
  IElementRegistry,
  IModeling,
  IPageModel,
  ISection,
} from '../../../../../../../contracts';
import environment from '../../../../../../../environment';

@inject(ValidationController, EventAggregator)
export class BasicsSection implements ISection {
  public path: string = '/sections/basics/basics';
  public canHandleElement: boolean = true;
  public businessObjInPanel: IModdleElement;
  public elementDocumentation: string;
  public validationError: boolean = false;
  public showModal: boolean = false;
  public elementType: string;

  public docsInput: HTMLElement;

  private modeling: IModeling;
  private modeler: IBpmnModeler;
  private bpmnModdle: IBpmnModdle;
  private elementInPanel: IShape;
  private previousProcessRefId: string;
  private validationController: ValidationController;
  private eventAggregator: EventAggregator;

  constructor(controller?: ValidationController, eventAggregator?: EventAggregator) {
    this.validationController = controller;
    this.eventAggregator = eventAggregator;
  }

  public activate(model: IPageModel): void {
    if (this.validationError) {
      this.businessObjInPanel.id = this.previousProcessRefId;
      this.validationController.validate();
    }

    this.elementInPanel = model.elementInPanel;
    this.businessObjInPanel = model.elementInPanel.businessObject;
    this.previousProcessRefId = model.elementInPanel.businessObject.id;

    this.modeling = model.modeler.get('modeling');
    this.bpmnModdle = model.modeler.get('moddle');
    this.modeler = model.modeler;

    this.validationController.subscribe((event: ValidateEvent) => {
      this.validateFormId(event);
    });

    this.init();

    this.setValidationRules();
  }

  public attached(): void {
    this.recoverInputHeight();

    this.saveInputHeightOnChange();
  }

  public detached(): void {
    this.docsInput.removeEventListener('mousedown', this.saveInputHeightOnMouseUp);

    if (!this.validationError) {
      return;
    }

    this.businessObjInPanel.id = this.previousProcessRefId;
    this.validationController.validate();
  }

  public isSuitableForElement(element: IShape): boolean {
    if (element === undefined || element === null) {
      return false;
    }

    return true;
  }

  public updateDocumentation(): void {
    this.elementInPanel.documentation = [];

    const documentationPropertyObject: object = {text: this.elementDocumentation};
    const documentation: IModdleElement = this.bpmnModdle.create('bpmn:Documentation', documentationPropertyObject);
    this.elementInPanel.documentation.push(documentation);

    const elementInPanelDocumentation: object = {documentation: this.elementInPanel.documentation};
    this.modeling.updateProperties(this.elementInPanel, elementInPanelDocumentation);
    this.publishDiagramChange();
  }

  public updateName(): void {
    this.modeling.updateLabel(this.elementInPanel, this.businessObjInPanel.name);

    this.publishDiagramChange();
  }

  public updateId(): void {
    this.validationController.validate();

    if (this.validationController.errors.length > 0) {
      return;
    }

    const updateProperty: object = {id: this.businessObjInPanel.id};
    this.modeling.updateProperties(this.elementInPanel, updateProperty);
    this.publishDiagramChange();
  }

  private init(): void {
    if (!this.businessObjInPanel) {
      return;
    }

    this.elementType = this.humanizeElementType(this.businessObjInPanel.$type);

    const documentationExists: boolean =
      this.businessObjInPanel.documentation !== undefined &&
      this.businessObjInPanel.documentation !== null &&
      this.businessObjInPanel.documentation.length > 0;

    if (documentationExists) {
      this.elementDocumentation = this.businessObjInPanel.documentation[0].text;
    } else {
      this.elementDocumentation = '';
    }
  }

  private humanizeElementType(type: string): string {
    const rawType: string = type.replace(/^bpmn:/, '');
    const humanizedType: string = rawType.replace(/([a-z])([A-Z])/, '$1 $2');

    return humanizedType;
  }

  private validateFormId(event: ValidateEvent): void {
    if (event.type !== 'validate') {
      return;
    }

    this.validationError = false;
    for (const result of event.results) {
      if (result.rule.property.displayName !== 'elementId') {
        continue;
      }
      if (result.valid === false) {
        this.validationError = true;
        document.getElementById(result.rule.property.displayName).style.border = '2px solid red';
      } else {
        document.getElementById(result.rule.property.displayName).style.border = '';
      }
    }
  }

  private formIdIsUnique(id: string): boolean {
    const elementRegistry: IElementRegistry = this.modeler.get('elementRegistry');

    const elementsWithSameId: Array<IShape> = elementRegistry.filter((element: IShape) => {
      const elementIsBusinessObjectInPanel: boolean = element.businessObject === this.businessObjInPanel;
      if (elementIsBusinessObjectInPanel) {
        return false;
      }

      const elementIsOfTypeLabel: boolean = element.type === 'label';
      if (elementIsOfTypeLabel) {
        return false;
      }

      const elementHasSameId: boolean = element.businessObject.id === this.businessObjInPanel.id;

      return elementHasSameId;
    });

    return elementsWithSameId.length === 0;
  }

  private isProcessIdUnique(id: string): boolean {
    // eslint-disable-next-line no-underscore-dangle
    const elementIds: Array<string> = this.modeler._definitions.rootElements.map((rootElement: IModdleElement) => {
      return rootElement.id;
    });

    const currentId: number = elementIds.indexOf(id);
    elementIds.splice(currentId, 1);

    return !elementIds.includes(id);
  }

  private setValidationRules(): void {
    ValidationRules.ensure((businessObject: IModdleElement) => businessObject.id)
      .displayName('elementId')
      .required()
      .withMessage('ID cannot be blank.')
      .then()
      .satisfies((id: string) => this.formIdIsUnique(id) && this.isProcessIdUnique(id))
      .withMessage('ID already exists.')
      .on(this.businessObjInPanel);
  }

  private saveInputHeightOnChange(): void {
    this.docsInput.addEventListener('mousedown', this.saveInputHeightOnMouseUp);
  }

  private recoverInputHeight(): void {
    this.docsInput.style.height = `${localStorage.getItem('docsInputHeight')}px`;
  }

  private saveInputHeightOnMouseUp: EventListenerOrEventListenerObject = () => {
    const resizeListenerFunction: EventListenerOrEventListenerObject = (): void => {
      localStorage.setItem('docsInputHeight', this.docsInput.clientHeight.toString());
      window.removeEventListener('mouseup', resizeListenerFunction);
    };
    window.addEventListener('mouseup', resizeListenerFunction);
  };

  private publishDiagramChange(): void {
    this.eventAggregator.publish(environment.events.diagramChange);
  }
}
