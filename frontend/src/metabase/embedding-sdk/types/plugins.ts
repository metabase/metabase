import type { ReactNode } from "react";

import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";
import type { ClickAction } from "metabase/visualizations/types";

import type { MetabaseQuestion } from "./question";

export type MetabaseDataPointObject = {
  value?: string | number | null | boolean | object;
  column?: {
    name?: string;
    display_name?: string;
  };
  data?: Record<string, string | number | null | boolean | object>;
  event?: MouseEvent;
  question?: MetabaseQuestion;
  raw?: {
    value?: string | number | null | boolean;
    column?: Record<string, any>;
    event?: MouseEvent;
    data?: {
      col: Record<string, any> | null;
      value: string | number | null | boolean;
    }[];
  };
};

export type MetabaseClickActionPluginsConfig = (
  clickActions: ClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) => ClickAction[] | { onClick: () => void };

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
