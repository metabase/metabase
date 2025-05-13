import { type ReactNode, useCallback, useEffect } from "react";
import { match } from "ts-pattern";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { renderOnlyInSdkProvider } from "embedding-sdk/components/private/SdkContext";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

import { StyledPublicComponentWrapper } from "./SdkDashboard.styled";
import {
  type InteractiveDashboardContextType,
  InteractiveDashboardProvider,
} from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type SdkDashboardProps = {
  /**
   * @internal
   * Controls the behavior of the dashboard.
   * - `editable`: Allows editing and drill-throughs
   * - `interactive`: Allows drill-throughs only
   */
  mode?: "editable" | "interactive" | "static";

  // @todo pass the question context to the question view component,
  //       once we have a public-facing question context.
  /**
   * A custom React component to render the question layout.
   * Use namespaced InteractiveQuestion components to build the layout.
   */
  renderDrillThroughQuestion?: () => ReactNode;

  /**
   * Height of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionHeight?: number;

  /**
   * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
   */
  plugins?: MetabasePluginsConfig;

  /**
   * Props for the drill-through question
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

const SdkDashboardInner = ({
  drillThroughQuestionProps,
  onEditQuestion,
  mode,
}: Pick<SdkDashboardProps, "mode"> &
  Pick<InteractiveDashboardContextType, "onEditQuestion"> &
  Pick<SdkDashboardProps, "drillThroughQuestionProps">) => {
  const { isEditing } = useDashboardContext();

  const dashboardActions = match({ mode, isEditing })
    .with(
      { mode: "editable", isEditing: false },
      () => SDK_DASHBOARD_VIEW_ACTIONS,
    )
    .with(
      { mode: "editable", isEditing: true },
      () => DASHBOARD_EDITING_ACTIONS,
    )
    .otherwise(() => DASHBOARD_DISPLAY_ACTIONS);

  return (
    <InteractiveDashboardProvider
      plugins={drillThroughQuestionProps?.plugins}
      onEditQuestion={onEditQuestion}
      dashboardActions={dashboardActions}
    >
      <Dashboard />
    </InteractiveDashboardProvider>
  );
};

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const SdkDashboard = ({
  dashboardId: initialDashboardId,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
  withFooter = true,
  hiddenParameters = [],
  drillThroughQuestionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
  style,
  drillThroughQuestionProps = {
    title: withTitle,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
  renderDrillThroughQuestion: AdHocQuestionView,
}: SdkDashboardProps) => {
  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const {
    displayOptions,
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
    isLoading,
    dashboardId,
  } = useSdkDashboardParams({
    dashboardId: initialDashboardId,
    withDownloads,
    withTitle,
    withFooter,
    hiddenParameters,
    initialParameters,
  });

  const {
    adhocQuestionUrl,
    onNavigateBackToDashboard,
    onEditQuestion,
    onNavigateToNewCardFromDashboard,
  } = useCommonDashboardParams({
    dashboardId,
  });

  const { theme } = useEmbedTheme();

  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      getEmbeddingMode({
        question,
        plugins: plugins as InternalMetabasePluginsConfig,
      }),
    [plugins],
  );

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(setErrorPage(null));
    }
  }, [dispatch, dashboardId]);

  if (isLoading) {
    return (
      <StyledPublicComponentWrapper className={className} style={style}>
        <SdkLoader />
      </StyledPublicComponentWrapper>
    );
  }

  if (!dashboardId || errorPage?.status === 404) {
    return (
      <StyledPublicComponentWrapper className={className} style={style}>
        <DashboardNotFoundError id={initialDashboardId} />
      </StyledPublicComponentWrapper>
    );
  }

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={initialParameters}
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
        downloadsEnabled={displayOptions.downloadsEnabled}
        background={displayOptions.background}
        bordered={displayOptions.bordered}
        hideParameters={displayOptions.hideParameters}
        titled={displayOptions.titled}
        cardTitled={withCardTitle}
        theme={theme}
        onLoad={handleLoad}
        onLoadWithoutCards={handleLoadWithoutCards}
        onError={(error) => dispatch(setErrorPage(error))}
        getClickActionMode={getClickActionMode}
        withFooter={withFooter}
      >
        {adhocQuestionUrl ? (
          <InteractiveAdHocQuestion
            questionPath={adhocQuestionUrl}
            onNavigateBack={onNavigateBackToDashboard}
            {...drillThroughQuestionProps}
          >
            {AdHocQuestionView && <AdHocQuestionView />}
          </InteractiveAdHocQuestion>
        ) : (
          <SdkDashboardInner
            drillThroughQuestionProps={drillThroughQuestionProps}
            onEditQuestion={onEditQuestion}
          />
        )}
      </DashboardContextProvider>
    </StyledPublicComponentWrapper>
  );
};

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = Omit<SdkDashboardProps, "mode">;
/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = Omit<SdkDashboardProps, "mode">;

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const EditableDashboard = (props: EditableDashboardProps) => {
  return <SdkDashboard mode="editable" {...props} />;
};

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = Omit<SdkDashboardProps, "mode">;

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = renderOnlyInSdkProvider(
  (props: InteractiveDashboardProps) => (
    <SdkDashboard {...props} mode="interactive" />
  ),
);

/**
 * @interface
 * @expand
 * @category StaticDashboard
 */
export type StaticDashboardProps = Omit<
  SdkDashboardProps,
  | "mode"
  | "drillThroughQuestionProps"
  | "drillThroughQuestionHeight"
  | "plugins"
>;

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category StaticDashboard
 */
export const StaticDashboard = (props: StaticDashboardProps) => (
  <SdkDashboard mode="static" {...props} />
);
