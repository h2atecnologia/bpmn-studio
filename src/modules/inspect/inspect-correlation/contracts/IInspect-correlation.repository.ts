import {IIdentity} from '@essential-projects/iam_contracts';
import {DataModels} from '@process-engine/management_api_contracts';
import {ProcessInstanceList} from '@process-engine/management_api_contracts/dist/data_models/correlation';

export interface IInspectCorrelationRepository {
  getAllCorrelationsForProcessModelId(
    processModelId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.Correlations.CorrelationList>;
  getLogsForCorrelation(
    correlation: DataModels.Correlations.Correlation,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<Array<DataModels.Logging.LogEntryList>>;
  getLogsForProcessInstance(
    processModelId: string,
    processInstance: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.Logging.LogEntryList>;
  getTokenForFlowNodeInstance(
    processModelId: string,
    correlationId: string,
    flowNodeId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.TokenHistory.TokenHistoryEntryList>;
  getTokenForFlowNodeByProcessInstanceId(
    processInstanceId: string,
    flowNodeId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.TokenHistory.TokenHistoryGroup>;
  getProcessInstancesForProcessModel(
    identity: IIdentity,
    processModelId: string,
    offset?: number,
    limit?: number,
  ): Promise<ProcessInstanceList>;
}
