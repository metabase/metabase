import { DashCardQuestionDownloadButton } from "metabase/dashboard/components/DashCard/DashCardQuestionDownloadButton";
import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
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
> &
  Pick<EmbeddingAdditionalHashOptions, "locale">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider
    {...contextProps}
    dashcardMenu={
      contextProps.dashcardMenu ??
      (({ dashcard, result }) =>
        contextProps.downloadsEnabled?.results &&
        !!result?.data &&
        !result?.error && (
          <DashCardQuestionDownloadButton result={result} dashcard={dashcard} />
        ))
    }
  >
    <PublicOrEmbeddedDashboardView />
  </DashboardContextProvider>
);
