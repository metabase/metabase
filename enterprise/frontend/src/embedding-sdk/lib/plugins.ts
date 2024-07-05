import type { ReactNode } from "react";

import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/DashCardMenu";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

export type SdkDataPointObject = Pick<
  ClickObject,
  "value" | "column" | "data" | "event"
>;

export type SdkClickActionPluginsConfig = (
  clickActions: ClickAction[],
  clickedDataPoint: SdkDataPointObject,
) => ClickAction[];

type DashCardMenuCustomElement = ({
  question,
}: {
  question: Question;
}) => ReactNode;

export type DashCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  customItems?: (
    | DashCardMenuItem
    | (({ question }: { question?: Question }) => DashCardMenuItem)
  )[];
};

export type SdkDashcardMenuPluginsConfig = {
  dashcardMenu?: DashCardMenuCustomElement | DashCardCustomMenuItem;
};

export type SdkPluginsConfig = {
  mapQuestionClickActions?: SdkClickActionPluginsConfig;
  dashboard?: SdkDashcardMenuPluginsConfig;
};
