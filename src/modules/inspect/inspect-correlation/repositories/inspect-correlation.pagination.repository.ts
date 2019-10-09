import {IIdentity} from '@essential-projects/iam_contracts';
import {DataModels} from '@process-engine/management_api_contracts';

import {
  ProcessInstance,
  ProcessInstanceList,
} from '@process-engine/management_api_contracts/dist/data_models/correlation';
import {IInspectCorrelationRepository} from '../contracts';
import {InspectCorrelationRepository} from './inspect-correlation.repository';

export class InspectCorrelationPaginationRepository extends InspectCorrelationRepository
  implements IInspectCorrelationRepository {
  public async getAllCorrelationsForProcessModelId(
    processModelId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.Correlations.CorrelationList> {
    return this.managementApiService.getCorrelationsByProcessModelId(identity, processModelId, offset, limit);
  }

  public async getLogsForCorrelation(
    correlation: DataModels.Correlations.Correlation,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<Array<DataModels.Logging.LogEntryList>> {
    const logsForAllProcessModelsOfCorrelation: Array<DataModels.Logging.LogEntryList> = [];

    for (const processModel of correlation.processInstances) {
      const logsForProcessModel: DataModels.Logging.LogEntryList = await this.managementApiService.getProcessModelLog(
        identity,
        processModel.processModelId,
        correlation.id,
        offset,
        limit,
      );

      logsForAllProcessModelsOfCorrelation.push(logsForProcessModel);
    }

    const logsForCorrelation: Array<DataModels.Logging.LogEntryList> = [].concat(
      ...logsForAllProcessModelsOfCorrelation,
    );

    return logsForCorrelation;
  }

  public async getLogsForProcessInstance(
    processModelId: string,
    processInstanceId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.Logging.LogEntryList> {
    const logs: DataModels.Logging.LogEntryList = await this.managementApiService.getProcessInstanceLog(
      identity,
      processModelId,
      processInstanceId,
      offset,
      limit,
    );

    return logs;
  }

  public async getTokenForFlowNodeInstance(
    processModelId: string,
    correlationId: string,
    flowNodeId: string,
    identity: IIdentity,
    offset?: number,
    limit?: number,
  ): Promise<DataModels.TokenHistory.TokenHistoryEntryList> {
    return this.managementApiService.getTokensForFlowNode(
      identity,
      correlationId,
      processModelId,
      flowNodeId,
      offset,
      limit,
    );
  }

  public getProcessInstancesForProcessModel(
    identity: IIdentity,
    processModelId: string,
    offset?: number,
    limit?: number,
  ): Promise<ProcessInstanceList> {
    return this.managementApiService.getProcessInstancesForProcessModel(identity, processModelId, offset, limit);
  }

  public getProcessInstancesById(identity: IIdentity, processInstanceId: string): Promise<ProcessInstance> {
    return this.managementApiService.getProcessInstanceById(identity, processInstanceId);
  }
}
