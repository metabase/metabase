import { useEffect } from "react";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import {
  DashboardNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { StyledPublicComponentWrapper } from "embedding-sdk/components/public/InteractiveDashboard/EditableDashboard.styled";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

import type { DrillThroughQuestionProps } from "../InteractiveQuestion/InteractiveQuestion";

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
export type EditableDashboardProps = {
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
} & Omit<SdkDashboardDisplayProps, "withTitle" | "hiddenParameters"> &
  DashboardEventHandlersProps;

const EditableDashboardInner = ({
  drillThroughQuestionProps,
  onEditQuestion,
}: Pick<InteractiveDashboardContextType, "onEditQuestion"> &
  Pick<EditableDashboardProps, "drillThroughQuestionProps">) => {
  const { isEditing } = useDashboardContext();

  const dashboardActions = isEditing
    ? DASHBOARD_EDITING_ACTIONS
    : SDK_DASHBOARD_VIEW_ACTIONS;

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
export const EditableDashboard = ({
  dashboardId: dashboardIdProp,
  initialParameters = {},
  withDownloads = false,
  drillThroughQuestionHeight,
  plugins,
  onLoad,
  onLoadWithoutCards,
  className,
  style,
  drillThroughQuestionProps = {
    title: true,
    height: drillThroughQuestionHeight,
    plugins: plugins,
  },
}: EditableDashboardProps) => {
  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const { isLocaleLoading } = useLocale();
  const { displayOptions, isLoading, dashboardId } = useSdkDashboardParams({
    dashboardId: dashboardIdProp,
    withDownloads,
    withTitle: true,
    hiddenParameters: undefined,
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
      <StyledPublicComponentWrapper className={className} style={style}>
        <SdkError
          message={errorPage.data?.message ?? t`Something's gone wrong`}
        />
      </StyledPublicComponentWrapper>
    );
  }

  return (
    <StyledPublicComponentWrapper className={className} style={style}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={initialParameters}
        navigateToNewCardFromDashboard={onNavigateToNewCardFromDashboard}
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
        getClickActionMode={({ question }) =>
          getEmbeddingMode({
            question,
            queryMode: EmbeddingSdkMode,
            plugins:
              drillThroughQuestionProps.plugins as InternalMetabasePluginsConfig,
          })
        }
      >
        {adhocQuestionUrl ? (
          <InteractiveAdHocQuestion
            questionPath={adhocQuestionUrl}
            onNavigateBack={onNavigateBackToDashboard}
            {...drillThroughQuestionProps}
          />
        ) : (
          <EditableDashboardInner
            drillThroughQuestionProps={drillThroughQuestionProps}
            onEditQuestion={onEditQuestion}
          />
        )}
      </DashboardContextProvider>
    </StyledPublicComponentWrapper>
  );
};
