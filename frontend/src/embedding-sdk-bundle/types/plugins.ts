import type { ReactNode } from "react";

import type { DashboardContextProps } from "metabase/dashboard/context";
import type { DashCardMenuItem } from "metabase/embedding-sdk/types/plugins";
import type { DashboardCard, Dataset } from "metabase-types/api";

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

export type DashboardCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
  /** @internal */
  dashcard: DashboardCard;
  /** @internal */
  result: Dataset;
  /** @internal */
  downloadsEnabled: DashboardContextProps["downloadsEnabled"];
}) => ReactNode;

export type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;

export type DashboardCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  /** @expand */
  customItems?: (DashCardMenuItem | CustomDashboardCardMenuItem)[];
};

export type DashboardCardMenu =
  | DashboardCardMenuCustomElement
  | DashboardCardCustomMenuItem;

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
