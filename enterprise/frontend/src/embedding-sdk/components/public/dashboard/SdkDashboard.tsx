import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
} from "react";
import { t } from "ttag";

import {
  DashboardNotFoundError,
  SdkError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/SdkAdHocQuestion";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { useLocale } from "metabase/common/hooks/use-locale";
import { setEditingDashboard, toggleSidebar } from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";

import type { DrillThroughQuestionProps } from "../SdkQuestion";

import {
  SdkDashboardStyledWrapper,
  SdkDashboardStyledWrapperWithRef,
} from "./SdkDashboardStyleWrapper";
import { SdkDashboardProvider } from "./context";
import { useCommonDashboardParams } from "./use-common-dashboard-params";

/**
 * @interface
 * @inline
 * @category Dashboard
 */
export type SdkDashboardProps = PropsWithChildren<
  {
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
    DashboardEventHandlersProps
>;

export type SdkDashboardInnerProps = SdkDashboardProps &
  Partial<
    Pick<
      DashboardContextProps,
      | "getClickActionMode"
      | "dashboardActions"
      | "dashcardMenu"
      | "navigateToNewCardFromDashboard"
    >
  >;

const SdkDashboardInner = ({
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
  drillThroughQuestionProps = {
    title: withTitle,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
  renderDrillThroughQuestion: AdHocQuestionView,
  dashboardActions,
  dashcardMenu = plugins?.dashboard?.dashboardCardMenu,
  getClickActionMode,
  navigateToNewCardFromDashboard = undefined,
  className,
  style,
  children,
}: SdkDashboardInnerProps) => {
  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const { isLocaleLoading } = useLocale();
  const { displayOptions, isLoading, dashboardId } = useSdkDashboardParams({
    dashboardId: dashboardIdProp,
    withDownloads,
    withTitle,
    withCardTitle,
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

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(resetErrorPage());
    }
  }, [dispatch, dashboardId]);

  if (isLocaleLoading || isLoading) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkLoader />
      </SdkDashboardStyledWrapper>
    );
  }

  if (!dashboardId || errorPage?.status === 404) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <DashboardNotFoundError id={dashboardIdProp} />
      </SdkDashboardStyledWrapper>
    );
  }

  if (errorPage) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkError
          message={errorPage.data?.message ?? t`Something's gone wrong`}
        />
      </SdkDashboardStyledWrapper>
    );
  }

  return (
    <DashboardContextProvider
      dashboardId={dashboardId}
      parameterQueryParams={initialParameters}
      navigateToNewCardFromDashboard={
        navigateToNewCardFromDashboard !== undefined
          ? navigateToNewCardFromDashboard
          : onNavigateToNewCardFromDashboard
      }
      downloadsEnabled={displayOptions.downloadsEnabled}
      background={displayOptions.background}
      bordered={displayOptions.bordered}
      hideParameters={displayOptions.hideParameters}
      titled={displayOptions.titled}
      cardTitled={displayOptions.cardTitled}
      theme={displayOptions.theme}
      onLoad={handleLoad}
      onLoadWithoutCards={handleLoadWithoutCards}
      onError={(error) => dispatch(setErrorPage(error))}
      getClickActionMode={getClickActionMode}
      dashcardMenu={dashcardMenu}
      dashboardActions={dashboardActions}
      onAddQuestion={(dashboard) => {
        dispatch(setEditingDashboard(dashboard));
        dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion));
      }}
    >
      {adhocQuestionUrl ? (
        <SdkDashboardStyledWrapperWithRef className={className} style={style}>
          <InteractiveAdHocQuestion
            questionPath={adhocQuestionUrl}
            onNavigateBack={onNavigateBackToDashboard}
            {...drillThroughQuestionProps}
          >
            {AdHocQuestionView && <AdHocQuestionView />}
          </InteractiveAdHocQuestion>
        </SdkDashboardStyledWrapperWithRef>
      ) : (
        <SdkDashboardProvider plugins={plugins} onEditQuestion={onEditQuestion}>
          {children ?? (
            <SdkDashboardStyledWrapperWithRef
              className={className}
              style={style}
            >
              <Dashboard className={EmbedFrameS.EmbedFrame} />
            </SdkDashboardStyledWrapperWithRef>
          )}
        </SdkDashboardProvider>
      )}
    </DashboardContextProvider>
  );
};

export const SdkDashboard = withPublicComponentWrapper(
  SdkDashboardInner,
) as typeof SdkDashboardInner &
  Pick<
    typeof Dashboard,
    | "Grid"
    | "Header"
    | "Title"
    | "Tabs"
    | "ParametersList"
    | "FullscreenButton"
    | "ExportAsPdfButton"
    | "InfoButton"
    | "NightModeButton"
    | "RefreshPeriod"
  >;

SdkDashboard.Grid = Dashboard.Grid;
SdkDashboard.Header = Dashboard.Header;
SdkDashboard.Title = Dashboard.Title;
SdkDashboard.Tabs = Dashboard.Tabs;
SdkDashboard.ParametersList = Dashboard.ParametersList;
SdkDashboard.FullscreenButton = Dashboard.FullscreenButton;
SdkDashboard.ExportAsPdfButton = Dashboard.ExportAsPdfButton;
SdkDashboard.InfoButton = Dashboard.InfoButton;
SdkDashboard.NightModeButton = Dashboard.NightModeButton;
SdkDashboard.RefreshPeriod = Dashboard.RefreshPeriod;
