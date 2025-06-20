import { DashCardQuestionDownloadButton } from "metabase/dashboard/components/DashCard/DashCardQuestionDownloadButton";
import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import type { DashboardCardMenuProps } from "metabase/dashboard/context/types/dashcard-menu";
import { isActionDashCard } from "metabase/dashboard/utils";
import type { EmbeddingAdditionalHashOptions } from "metabase/public/lib/types";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export type PublicOrEmbeddedDashboardProps = Pick<
  DashboardContextProps,
  | "dashboardId"
  | "hasNightModeToggle"
  | "isFullscreen"
  | "isNightMode"
  | "onFullscreenChange"
  | "onNightModeChange"
  | "onRefreshPeriodChange"
  | "refreshPeriod"
  | "setRefreshElapsedHook"
  | "background"
  | "bordered"
  | "titled"
  | "theme"
  | "hideParameters"
  | "downloadsEnabled"
  | "parameterQueryParams"
  | "onLoad"
  | "onLoadWithoutCards"
  | "cardTitled"
  | "withFooter"
  | "onError"
  | "getClickActionMode"
  | "navigateToNewCardFromDashboard"
  | "dashcardMenu"
  | "onEditQuestion"
> &
  Pick<EmbeddingAdditionalHashOptions, "locale">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider
    {...contextProps}
    isDashcardVisible={(dc) => !isActionDashCard(dc)}
    dashcardMenu={
      contextProps.dashcardMenu ??
      (({ dashboard, dashcard }: DashboardCardMenuProps) => (
        <DashCardQuestionDownloadButton
          dashboard={dashboard ?? undefined}
          dashcard={dashcard}
        />
      ))
    }
  >
    <PublicOrEmbeddedDashboardView />
  </DashboardContextProvider>
);
