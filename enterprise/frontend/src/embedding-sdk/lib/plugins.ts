import type { ReactNode } from "react";

import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/DashCardMenu";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type { Card as QuestionType } from "metabase-types/api";

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
  question: QuestionType;
}) => ReactNode;

export type CustomDashCardMenuItem = ({
  question,
}: {
  question?: QuestionType;
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
