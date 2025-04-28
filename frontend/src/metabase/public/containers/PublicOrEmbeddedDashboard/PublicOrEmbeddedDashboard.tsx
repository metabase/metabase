import {
  type DashboardContextProps,
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import type { EmbeddingAdditionalHashOptions } from "metabase/public/lib/types";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

type PublicOrEmbeddedDashboardProps = Pick<
  EmbeddingAdditionalHashOptions,
  "locale"
>;

const PublicOrEmbeddedDashboardInner = ({
  locale,
}: PublicOrEmbeddedDashboardProps) => {
  const {
    dashboard,
    selectedTabId,
    parameters,
    parameterValues,
    draftParameterValues,
    slowCards,
    isFullscreen,
    isNightMode = false,
    onFullscreenChange,
    onNightModeChange,
    onRefreshPeriodChange,
    refreshPeriod,
    setRefreshElapsedHook,
    hasNightModeToggle,
    background,
    bordered,
    titled,
    theme,
    getClickActionMode,
    downloadsEnabled,
    hideParameters,
    withFooter,
    navigateToNewCardFromDashboard,
    dashboardId,
    cardTitled,
  } = useDashboardContext();

  return (
    <LocaleProvider locale={locale} shouldWaitForLocale>
      <PublicOrEmbeddedDashboardView
        dashboard={dashboard}
        hasNightModeToggle={hasNightModeToggle}
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        onFullscreenChange={onFullscreenChange}
        onNightModeChange={onNightModeChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        refreshPeriod={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        selectedTabId={selectedTabId}
        parameters={parameters}
        parameterValues={parameterValues}
        draftParameterValues={draftParameterValues}
        dashboardId={dashboardId}
        background={background}
        bordered={bordered}
        titled={titled}
        theme={theme}
        getClickActionMode={getClickActionMode}
        hideParameters={hideParameters}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
        slowCards={slowCards}
        cardTitled={cardTitled}
        downloadsEnabled={downloadsEnabled}
        withFooter={withFooter}
      />
    </LocaleProvider>
  );
};

export const PublicOrEmbeddedDashboard = ({
  dashboardId,
  hasNightModeToggle,
  isFullscreen,
  isNightMode,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
  background,
  bordered,
  titled,
  theme,
  hideParameters,
  downloadsEnabled,
  locale,

  parameterQueryParams,
  onLoad,
  onLoadWithoutCards,
  cardTitled,
  withFooter,
  navigateToNewCardFromDashboard,
  onError,
  getClickActionMode,
}: Pick<
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
> &
  Pick<EmbeddingAdditionalHashOptions, "locale">) => (
  <DashboardContextProvider
    hasNightModeToggle={hasNightModeToggle}
    isFullscreen={isFullscreen}
    isNightMode={isNightMode}
    onFullscreenChange={onFullscreenChange}
    onNightModeChange={onNightModeChange}
    onRefreshPeriodChange={onRefreshPeriodChange}
    refreshPeriod={refreshPeriod}
    setRefreshElapsedHook={setRefreshElapsedHook}
    dashboardId={dashboardId}
    parameterQueryParams={parameterQueryParams}
    background={background}
    bordered={bordered}
    titled={titled}
    theme={theme}
    hideParameters={hideParameters}
    downloadsEnabled={downloadsEnabled}
    onLoad={onLoad}
    onLoadWithoutCards={onLoadWithoutCards}
    cardTitled={cardTitled}
    withFooter={withFooter}
    navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
    onError={onError}
    getClickActionMode={getClickActionMode}
  >
    <PublicOrEmbeddedDashboardInner locale={locale} />
  </DashboardContextProvider>
);
