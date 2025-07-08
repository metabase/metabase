import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { InteractiveQuestionProvider } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { InteractiveQuestionDefaultView } from "embedding-sdk/components/private/InteractiveQuestionDefaultView";
import {
  DashboardNotFoundError,
  PublicComponentWrapper,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { MetabaseQuestion } from "embedding-sdk/types";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { useLocale } from "metabase/common/hooks/use-locale";
import { setEditingDashboard, toggleSidebar } from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { Grid } from "metabase/dashboard/components/Dashboard/components/Grid";
import {
  DashboardInfoButton,
  ExportAsPdfButton,
  FullscreenToggle,
  NightModeToggleButton,
} from "metabase/dashboard/components/DashboardHeader/buttons";
import {
  DashboardParameterList,
  type DashboardParameterListProps,
} from "metabase/dashboard/components/DashboardParameterList";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { DashboardTitle } from "metabase/dashboard/components/DashboardTitle";
import { RefreshWidget } from "metabase/dashboard/components/RefreshWidget";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  type DashboardContextProps,
  DashboardContextProvider,
  type DashboardContextProviderHandle,
  useDashboardContext,
} from "metabase/dashboard/context";
import {
  getDashboardComplete,
  getDashboardHeaderValuePopulatedParameters,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
import type { DashboardId } from "metabase-types/api";

import type {
  DrillThroughQuestionProps,
  InteractiveQuestionProps,
} from "../InteractiveQuestion";

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

type RenderMode = "dashboard" | "question" | "queryBuilder";

/**
 * Despite being a prop for a specific component, to avoid circular dependencies, the type is defined here.
 */
export type EditableDashboardOwnProps = {
  /**
   * Additional props to pass to the query builder rendered by `InteractiveQuestion` when creating a new dashboard question.
   */
  queryBuilderProps?: Pick<InteractiveQuestionProps, "entityTypes">;
};

export type SdkDashboardInnerProps = SdkDashboardProps &
  Partial<
    Pick<
      DashboardContextProps,
      | "getClickActionMode"
      | "dashboardActions"
      | "dashcardMenu"
      | "navigateToNewCardFromDashboard"
    >
  > &
  EditableDashboardOwnProps;

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
  queryBuilderProps,
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

  const [renderModeState, setRenderMode] = useState<
    "dashboard" | "queryBuilder"
  >("dashboard");
  const finalRenderMode: RenderMode = adhocQuestionUrl
    ? "question"
    : renderModeState;

  // Now only used when rerendering the dashboard after creating a new question from the dashboard.
  const dashboardContextProviderRef = useRef<DashboardContextProviderHandle>();

  const [newDashboardQuestionId, setNewDashboardQuestionId] =
    useState<number>();

  const dashboard = useSelector(getDashboardComplete);
  const autoScrollToDashcardId = useMemo(
    () =>
      dashboard?.dashcards.find(
        (dashcard) => dashcard.card_id === newDashboardQuestionId,
      )?.id,
    [dashboard?.dashcards, newDashboardQuestionId],
  );

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
      ref={dashboardContextProviderRef}
      dashboardId={dashboardId}
      parameterQueryParams={initialParameters}
      navigateToNewCardFromDashboard={
        navigateToNewCardFromDashboard !== undefined
          ? navigateToNewCardFromDashboard
          : onNavigateToNewCardFromDashboard
      }
      onNewQuestion={() => {
        setRenderMode("queryBuilder");
      }}
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
      autoScrollToDashcardId={autoScrollToDashcardId}
    >
      {match(finalRenderMode)
        .with("question", () => (
          <SdkDashboardStyledWrapperWithRef className={className} style={style}>
            <InteractiveAdHocQuestion
              // `adhocQuestionUrl` would have value if renderMode is "question"
              questionPath={adhocQuestionUrl!}
              onNavigateBack={onNavigateBackToDashboard}
              {...drillThroughQuestionProps}
            >
              {AdHocQuestionView && <AdHocQuestionView />}
            </InteractiveAdHocQuestion>
          </SdkDashboardStyledWrapperWithRef>
        ))
        .with("dashboard", () => (
          <SdkDashboardProvider
            plugins={plugins}
            onEditQuestion={onEditQuestion}
          >
            {children ?? (
              <SdkDashboardStyledWrapperWithRef
                className={className}
                style={style}
              >
                <Dashboard className={EmbedFrameS.EmbedFrame} />
              </SdkDashboardStyledWrapperWithRef>
            )}
          </SdkDashboardProvider>
        ))
        .with("queryBuilder", () => (
          <DashboardQueryBuilder
            targetDashboardId={dashboardId}
            onCreate={(question) => {
              setNewDashboardQuestionId(question.id);
              setRenderMode("dashboard");
              dashboardContextProviderRef.current?.refetchDashboard();
            }}
            onNavigateBack={() => {
              setRenderMode("dashboard");
            }}
            queryBuilderProps={queryBuilderProps}
          />
        ))
        .exhaustive()}
    </DashboardContextProvider>
  );
};

export const SdkDashboard = ({ ...props }: SdkDashboardInnerProps) => (
  <PublicComponentWrapper>
    <SdkDashboardInner {...props} />
  </PublicComponentWrapper>
);

SdkDashboard.Grid = Grid;
SdkDashboard.ParameterList = SdkDashboardParameterList;
SdkDashboard.Title = DashboardTitle;
SdkDashboard.Tabs = DashboardTabs;
SdkDashboard.FullscreenButton = FullscreenToggle;
SdkDashboard.ExportAsPdfButton = ExportAsPdfButton;
SdkDashboard.InfoButton = DashboardInfoButton;
SdkDashboard.NightModeButton = NightModeToggleButton;
SdkDashboard.RefreshPeriod = RefreshWidget;

function SdkDashboardParameterList(
  props: Omit<DashboardParameterListProps, "parameters">,
) {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  return <DashboardParameterList parameters={parameters} {...props} />;
}

type DashboardQueryBuilderProps = {
  targetDashboardId: DashboardId;
  onCreate: (question: MetabaseQuestion) => void;
  onNavigateBack: () => void;
  queryBuilderProps: EditableDashboardOwnProps["queryBuilderProps"];
};

/**
 * The sole reason this is extracted into a separate component is to access the dashboard context
 */
function DashboardQueryBuilder({
  targetDashboardId,
  onCreate,
  onNavigateBack,
  queryBuilderProps,
}: DashboardQueryBuilderProps) {
  const dispatch = useSdkDispatch();
  const { dashboard } = useDashboardContext();

  /**
   * This won't happen at this point in time. As `DashboardQueryBuilder` is guaranteed to be rendered
   * while under the dashboard context, after a dashboard has already been loaded.
   *
   * I added this condition just to satisfy TypeScript, so that below this, the dashboard value isn't null.
   */
  if (!dashboard) {
    return null;
  }

  return (
    <InteractiveQuestionProvider
      questionId="new"
      targetDashboardId={targetDashboardId}
      onSave={(question, { isNewQuestion }) => {
        if (isNewQuestion) {
          onCreate(question);
          dispatch(setEditingDashboard(dashboard));
        }
      }}
      onNavigateBack={onNavigateBack}
      backToDashboard={dashboard}
      entityTypes={queryBuilderProps?.entityTypes}
    >
      <InteractiveQuestionDefaultView
        withResetButton
        withChartTypeSelector
        // The default value is 600px and it cuts off the "Visualize" button.
        height="700px"
      />
    </InteractiveQuestionProvider>
  );
}
