import type { ReactNode } from "react";

import type { DashboardContextProps } from "metabase/dashboard/context";
import type { DashCardMenuItem } from "metabase/embedding-sdk/types/plugins";
import type { MetabaseQuestion } from "metabase/embedding-sdk/types/question";
import type { DashboardCard, Dataset } from "metabase-types/api";

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
