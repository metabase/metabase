import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import { LocaleProvider } from "metabase/public/LocaleProvider";
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
  | "navigateToNewCardFromDashboard"
  | "onError"
  | "getClickActionMode"
  | "navigateToNewCardFromDashboard"
> &
  Pick<EmbeddingAdditionalHashOptions, "locale">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider {...contextProps}>
    <LocaleProvider locale={locale} shouldWaitForLocale>
      <PublicOrEmbeddedDashboardView />
    </LocaleProvider>
  </DashboardContextProvider>
);
