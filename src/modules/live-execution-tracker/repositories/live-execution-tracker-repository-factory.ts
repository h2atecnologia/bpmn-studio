import {ILiveExecutionTrackerRepository} from '../contracts/index';
import {processEngineSupportsPagination} from '../../../services/process-engine-version-module/process-engine-version-module';
import {LiveExecutionTrackerPaginationRepository} from './live-execution-tracker.pagination-repository';
import {LiveExecutionTrackerRepository} from './live-execution-tracker.repository';

export function createRepository(managementApiClient, runtimeVersion: string): ILiveExecutionTrackerRepository {
  if (processEngineSupportsPagination(runtimeVersion)) {
    return new LiveExecutionTrackerPaginationRepository(managementApiClient);
  }

  return new LiveExecutionTrackerRepository(managementApiClient);
}
