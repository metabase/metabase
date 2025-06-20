import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
} from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { renderOnlyInSdkProvider } from "embedding-sdk/components/private/SdkContext";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/InteractiveDashboard.styled";
import { useCommonDashboardParams } from "embedding-sdk/components/public/InteractiveDashboard/use-common-dashboard-params";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type {
  DashboardCardCustomMenuItem,
  DashboardCardMenuCustomElement,
  MetabasePluginsConfig,
} from "embedding-sdk/types/plugins";
import {
  isCustomElementFn,
  isCustomMenuConfig,
  isReactNode,
} from "metabase/dashboard/components/DashCard/DashCardMenu/type-guards";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import type { DashboardCardMenuProps } from "metabase/dashboard/context/types/dashcard-menu";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { isNotNull } from "metabase/lib/types";
import { PublicOrEmbeddedDashboard } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

import { InteractiveDashboardProvider } from "./context";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = {
  /**
   * Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.
   */
  plugins?: MetabasePluginsConfig;

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
  drillThroughQuestionHeight?: CSSProperties["height"];

  /**
   * Props of a question component when drilled from the dashboard to a question level.
   */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
} & SdkDashboardDisplayProps &
  DashboardEventHandlersProps;

const InteractiveDashboardInner = ({
  dashboardId: dashboardIdProp,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
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
}: InteractiveDashboardProps) => {
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
    dashboardId,
    isLoading,
  } = useSdkDashboardParams({
    dashboardId: dashboardIdProp,
    withDownloads,
    withTitle,
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
      dispatch(resetErrorPage());
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
        <DashboardNotFoundError id={dashboardIdProp} />
      </StyledPublicComponentWrapper>
    );
  }

  if (errorPage) {
    return (
      <StyledPublicComponentWrapper
        className={className}
        style={style}
        ref={ref}
      >
        <SdkError
          message={errorPage.data?.message ?? t`Something's gone wrong`}
        />
      </StyledPublicComponentWrapper>
    );
  }
  const dashcardMenu = match(plugins?.dashboard?.dashboardCardMenu)
    .with(P.when(isCustomMenuConfig), (menu: DashboardCardCustomMenuItem) => ({
      download: menu.withDownloads,
      "edit-link": menu.withEditLink,
      "edit-visualization": menu.withEditLink,
      customItems: menu.customItems
        ?.map((item) =>
          typeof item === "function"
            ? (props: DashboardCardMenuProps) =>
                item({
                  question: transformSdkQuestion(props.question),
                })
            : item,
        )
        .filter(isNotNull),
    }))
    .with(
      P.when(isCustomElementFn),
      (menu: DashboardCardMenuCustomElement) =>
        (props: { question: Question }) =>
          menu({ question: transformSdkQuestion(props.question) }),
    )
    .with(P.when(isReactNode), (menu) => menu)
    .exhaustive();

  return (
    <StyledPublicComponentWrapper className={className} style={style} ref={ref}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          onNavigateBack={onNavigateBackToDashboard}
          {...drillThroughQuestionProps}
        >
          {AdHocQuestionView && <AdHocQuestionView />}
        </InteractiveAdHocQuestion>
      ) : (
        <InteractiveDashboardProvider
          plugins={plugins}
          onEditQuestion={onEditQuestion}
          dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
        >
          <PublicOrEmbeddedDashboard
            dashboardId={dashboardId}
            parameterQueryParams={initialParameters}
            hideParameters={displayOptions.hideParameters}
            background={displayOptions.background}
            titled={displayOptions.titled}
            cardTitled={withCardTitle}
            withFooter={false}
            theme={theme}
            getClickActionMode={getClickActionMode}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            bordered={displayOptions.bordered}
            navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
            onLoad={handleLoad}
            onLoadWithoutCards={handleLoadWithoutCards}
            onError={(error) => dispatch(setErrorPage(error))}
            downloadsEnabled={{ pdf: withDownloads, results: withDownloads }}
            isNightMode={false}
            onNightModeChange={_.noop}
            hasNightModeToggle={false}
            dashcardMenu={dashcardMenu}
          />
        </InteractiveDashboardProvider>
      )}
    </StyledPublicComponentWrapper>
  );
};

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = renderOnlyInSdkProvider(
  InteractiveDashboardInner,
);
