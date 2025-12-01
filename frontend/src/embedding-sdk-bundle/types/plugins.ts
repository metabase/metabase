import type { DashboardCardMenu } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";

import type { MetabaseQuestion } from "./question";

export type MetabaseClickAction = {
  name: string;
} & Record<string, any>;

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
  clickActions: MetabaseClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) => MetabaseClickAction[] | { onClick: () => void };

export type MetabaseDashboardPluginsConfig = {
  dashboardCardMenu?: DashboardCardMenu;
};

export type MetabasePluginsConfig = {
  mapQuestionClickActions?: MetabaseClickActionPluginsConfig;
  dashboard?: MetabaseDashboardPluginsConfig;
};

export type MetabaseGlobalPluginsConfig = MetabasePluginsConfig & {
  handleLink?: (url: string) => { handled: boolean };
  /**
   * Provides a custom illustration to display when there is no data.
   *
   * @returns A base64-encoded image string, or null to use the default illustration
   */
  getNoDataIllustration?: () => string | null | undefined;

  /**
   * Provides a custom illustration to display when there is no object (e.g., no dashboards, no collections).
   *
   * @returns A base64-encoded image string, or null to use the default illustration
   */
  getNoObjectIllustration?: () => string | null | undefined;
};
