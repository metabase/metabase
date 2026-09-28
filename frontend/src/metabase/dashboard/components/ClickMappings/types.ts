import type { Target } from "metabase/dashboard/utils/click-behavior";
import type Question from "metabase-lib/v1/Question";
import type {
  ClickBehavior,
  ClickBehaviorTarget,
  Dashboard,
  DashboardCard,
} from "metabase-types/api";

export type TargetItem = Target & {
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
