import type {
  ActionDashboardCard,
  Dashboard,
  ParameterMappedForActionExecution,
  WritebackParameter,
} from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";
import type {
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import type { ClickObject } from "metabase-types/types/Visualization";

type ActionClickExtraData = {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  parameterValuesBySlug: Record<string, { value: ParameterValueOrArray }>;
  userAttributes: unknown[];
};

export type ActionClickObject = Omit<ClickObject, "extraData"> & {
  data: any;
  extraData: ActionClickExtraData;
  onSubmit: () => (
    parameters: ParameterMappedForActionExecution[],
  ) => Promise<boolean>;
  missingParameters: WritebackParameter[];
};

export type ActionClickBehaviorData = {
  column: Partial<Column>;
  parameter: Record<ParameterId, { value: ParameterValueOrArray }>;
  parameterByName: Record<string, { value: ParameterValueOrArray }>;
  parameterBySlug: Record<string, { value: ParameterValueOrArray }>;
  userAttribute: Record<string, unknown>;
};
