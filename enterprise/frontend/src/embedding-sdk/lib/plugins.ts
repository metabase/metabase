import type { ReactNode } from "react";

import type { MetabaseQuestion } from "embedding-sdk/types/public/question";
import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/DashCardMenu";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";

export type SdkDataPointObject = Pick<
  ClickObject,
  "value" | "column" | "data" | "event"
>;

export type SdkClickActionPluginsConfig = (
  clickActions: ClickAction[],
  clickedDataPoint: SdkDataPointObject,
) => ClickAction[];

export type DashCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
}) => ReactNode;

export type CustomDashCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;

export type DashCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  customItems?: (DashCardMenuItem | CustomDashCardMenuItem)[];
};

export type SdkDashCardMenuPluginsConfig = {
  dashcardMenu?: DashCardMenuCustomElement | DashCardCustomMenuItem;
};

export type SdkPluginsConfig = {
  mapQuestionClickActions?: SdkClickActionPluginsConfig;
  dashboard?: SdkDashCardMenuPluginsConfig;
};
