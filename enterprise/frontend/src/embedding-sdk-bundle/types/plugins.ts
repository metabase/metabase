import type { DashboardCardMenu } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";

export type MetabaseClickAction = {
  name: string;
} & Record<string, any>;

export type MetabaseDataPointObject = {
  value?: string | number | null | boolean;
  column?: Record<string, any>;
  event?: MouseEvent;
  data?: {
    col: Record<string, any> | null;
    value: string | number | null | boolean;
  }[];
};

export type MetabaseClickActionPluginsConfig = (
  clickActions: MetabaseClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) => MetabaseClickAction[];

export type MetabaseDashboardPluginsConfig = {
  dashboardCardMenu?: DashboardCardMenu;
};

export type MetabasePluginsConfig = {
  mapQuestionClickActions?: MetabaseClickActionPluginsConfig;
  dashboard?: MetabaseDashboardPluginsConfig;
};
