import type Question from "metabase-lib/v1/Question";
import type {
  ClickBehavior,
  ClickBehaviorTarget,
  Dashboard,
  DashboardCard,
  DatasetColumn,
  Parameter,
} from "metabase-types/api";

export type TargetItem = {
  id: string;
  name: string | null | undefined;
  target: ClickBehaviorTarget;
  sourceFilters: {
    column: (source: DatasetColumn, question: Question) => boolean;
    parameter: (source: Parameter, question: Question) => boolean;
    userAttribute: (source: string, question: Question) => boolean;
  };
  type?: ClickBehaviorTarget["type"];
};

export type SourceType = "column" | "parameter" | "userAttribute";

export type SourceOption = {
  type?: SourceType;
  id?: string;
  name?: string;
};

export type SourceOptionsByType = Partial<Record<SourceType, SourceOption[]>>;

export type ClickMappingsHocProps = {
  userAttributes: string[];
};

export type ClickMappingsOwnProps = {
  object: Dashboard | Question | undefined;
  dashcard: DashboardCard;
  isDashboard?: boolean;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
  excludeParametersSources?: boolean;
};
