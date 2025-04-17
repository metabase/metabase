import type { ReactNode } from "react";

import type { DashCardMenuItem } from "./dashboard";
import type { MetabaseQuestion } from "./question";

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

export type DashboardCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
}) => ReactNode;

export type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;

export type DashboardCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  customItems?: (DashCardMenuItem | CustomDashboardCardMenuItem)[];
};

export type MetabaseDashboardPluginsConfig = {
  dashboardCardMenu?:
    | DashboardCardMenuCustomElement
    | DashboardCardCustomMenuItem;
};

export type MetabasePluginsConfig = {
  mapQuestionClickActions?: MetabaseClickActionPluginsConfig;
  dashboard?: MetabaseDashboardPluginsConfig;
};
