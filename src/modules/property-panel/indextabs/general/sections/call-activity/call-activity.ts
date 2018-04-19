import {IPagination, IProcessDefEntity} from '@process-engine/bpmn-studio_client';
import {inject} from 'aurelia-framework';
import {Router} from 'aurelia-router';
import {
  IBpmnModeler,
  ICallActivityElement,
  IPageModel,
  ISection,
  IShape,
} from '../../../../../../contracts';
import {GeneralService} from '../../service/general.service';

@inject(GeneralService, Router)
export class CallActivitySection implements ISection {

  public path: string = '/sections/call-activity/call-activity';
  public canHandleElement: boolean = false;

  public allProcesses: IPagination<IProcessDefEntity>;
  public selectedProcess: IProcessDefEntity;

  private modeler: IBpmnModeler;
  private businessObjInPanel: ICallActivityElement;
  private generalService: GeneralService;
  private router: Router;

  constructor(generalService?: GeneralService, router?: Router) {
    this.generalService = generalService;
    this.router = router;
  }

  public async activate(model: IPageModel): Promise<void> {
    this.businessObjInPanel = model.elementInPanel.businessObject;
    this.modeler = model.modeler;
    await this._getAllProcesses();
    this.selectedProcess = this.allProcesses.data.find((process: IProcessDefEntity) => {
      return process.key === this.businessObjInPanel.calledElement;
    });
  }

  public isSuitableForElement(element: IShape): boolean {
    const elementIsCallActivity: boolean = element !== undefined
                                        && element.businessObject !== undefined
                                        && element.businessObject.$type === 'bpmn:CallActivity';

    return elementIsCallActivity;
  }

  public navigateToCalledProcess(): void {

    this.modeler.saveXML({}, async(error: Error, xml: string) => {
      const processId: string = this.router.currentInstruction.params.processDefId;
      const processDef: IProcessDefEntity = this.allProcesses.data.find((process: IProcessDefEntity) => {
        return processId === process.id;
      });
      await this.generalService.updateProcessDef(processDef, xml);
      this.router.navigate(`/processdef/${this.selectedProcess.id}/detail`);
    });
  }

  public updateCalledProcess(): void {
    this.businessObjInPanel.calledElement = this.selectedProcess.key;
  }

  private clearCalledElement(): void {
    this.businessObjInPanel.calledElement = '';
  }

  private async _getAllProcesses(): Promise<void> {
    this.allProcesses = await this.generalService.getAllProcesses();
  }
}