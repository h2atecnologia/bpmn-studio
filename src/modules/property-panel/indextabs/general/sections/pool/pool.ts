import {inject} from 'aurelia-framework';
import {ValidateEvent, ValidationController, ValidationRules} from 'aurelia-validation';
import { Config } from 'protractor';
import {
  IBpmnModdle,
  IBpmnModeler,
  IElementRegistry,
  IModdleElement,
  IPageModel,
  IPoolElement,
  ISection,
  IShape,
} from '../../../../../../contracts';

@inject(ValidationController)
export class PoolSection implements ISection {

  public path: string = '/sections/pool/pool';
  public canHandleElement: boolean = false;
  public validationController: ValidationController;
  public validationError: boolean = false;

  private businessObjInPanel: IPoolElement;
  private modeler: IBpmnModeler;
  private moddle: IBpmnModdle;
  private previousProcessRefId: string;

  constructor(controller?: ValidationController) {
    this.validationController = controller;
  }

  public activate(model: IPageModel): void {
    if (this.validationError) {
      this.businessObjInPanel.processRef.id = this.previousProcessRefId;
      this.validationController.validate();
    }

    this.businessObjInPanel = model.elementInPanel.businessObject;
    this.previousProcessRefId = this.businessObjInPanel.processRef.id;
    this.moddle = model.modeler.get('moddle');
    this.modeler = model.modeler;

    this.validationController.subscribe((event: ValidateEvent) => {
      this._validateId(event);
    });

    this._setValidationRules();
  }

  public detached(): void {
    if (this.validationError) {
      this.businessObjInPanel.processRef.id = this.previousProcessRefId;
      this.validationController.validate();
    }
  }

  public isSuitableForElement(element: IShape): boolean {
    return this._elementIsParticipant(element);
  }

  private _elementIsParticipant(element: IShape): boolean {
    return element !== undefined
        && element.businessObject !== undefined
        && element.businessObject.$type === 'bpmn:Participant';
  }

  private _clearVersion(): void {
    this.businessObjInPanel.processRef.versionTag = '';
  }

  private _clearId(): void {
    this.businessObjInPanel.processRef.id = '';
    this.validationController.validate();
  }

  private _clearName(): void {
    this.businessObjInPanel.processRef.name = '';
  }

  private _validateId(event: ValidateEvent): void {
    if (event.type !== 'validate') {
      return;
    }
    this.validationError = false;

    for (const result of event.results) {
      if (result.rule.property.displayName !== 'processId') {
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

  private _formIdIsUniqu(id: string): boolean {
    const elementRegistry: IElementRegistry = this.modeler.get('elementRegistry');
    const elementsWithSameId: Array<IShape> =  elementRegistry.filter((element: IShape) => {
      if (element.businessObject !== this.businessObjInPanel) {
        if (element.type !== 'label') {
          return element.businessObject.id === this.businessObjInPanel.processRef.id;
        }
      }
      return false;
    });

    return elementsWithSameId.length === 0;
  }

  private _isProcessIdUnique(id: string): boolean {
    const elementIds: Array<string> = this.modeler._definitions.rootElements.map((rootElement: IModdleElement) => {
      return rootElement.id;
    });

    const currentId: number = elementIds.indexOf(this.businessObjInPanel.processRef.id);
    elementIds.splice(currentId, 1);

    return !elementIds.includes(id);
  }

  private _setValidationRules(): void {
    ValidationRules.ensure((businessObject: IModdleElement) => businessObject.id)
    .displayName('processId')
    .required()
    .withMessage(`Process-Id cannot be blank.`)
    .then()
    .satisfies((id: string) => this._formIdIsUniqu(id) && this._isProcessIdUnique(id))
    .withMessage(`Process-Id already exists.`)
    .on(this.businessObjInPanel.processRef);
  }
}
