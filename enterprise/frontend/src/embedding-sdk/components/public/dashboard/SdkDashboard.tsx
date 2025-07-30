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

import {
  DashboardNotFoundError,
  SdkError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk/components/private/SdkAdHocQuestion";
import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk/store";
import type { MetabaseQuestion } from "embedding-sdk/types";
import type { DashboardEventHandlersProps } from "embedding-sdk/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import { useConfirmation } from "metabase/common/hooks";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  setEditingDashboard,
  toggleSidebar,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  type DashboardContextProps,
  DashboardContextProvider,
  type DashboardContextProviderHandle,
  useDashboardContext,
} from "metabase/dashboard/context";
import { getDashboardComplete, getIsDirty } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { dismissAllUndo } from "metabase/redux/undo";
import { getErrorPage } from "metabase/selectors/app";

import type {
  DrillThroughQuestionProps,
  SdkQuestionProps,
} from "../SdkQuestion";

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
    DashboardEventHandlersProps &
    EditableDashboardOwnProps
>;

type RenderMode = "dashboard" | "question" | "queryBuilder";

/**
 * Despite being a prop for a specific component, to avoid circular dependencies, the type is defined here.
 * @interface
 * @inline
 */
export type EditableDashboardOwnProps = {
  /**
   * Additional props to pass to the query builder rendered by `InteractiveQuestion` when creating a new dashboard question.
   */
  dataPickerProps?: Pick<SdkQuestionProps, "entityTypes">;
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
  >;

const SdkDashboardInner = ({
  dashboardId,
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
  dashcardMenu,
  getClickActionMode,
  navigateToNewCardFromDashboard = undefined,
  className,
  style,
  children,
  dataPickerProps,
}: SdkDashboardInnerProps) => {
  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const { isLocaleLoading } = useLocale();
  const { displayOptions } = useSdkDashboardParams({
    dashboardId,
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

  const finalDashcardMenu =
    plugins?.dashboard?.dashboardCardMenu ?? dashcardMenu;

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

  const { modalContent, show } = useConfirmation();
  const isDashboardDirty = useSelector(getIsDirty);

  if (isLocaleLoading) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkLoader />
      </SdkDashboardStyledWrapper>
    );
  }

  // Passing an invalid entity ID format results in a 400 Bad Request.
  // We can show this as a generic "not found" error on the frontend.
  const isDashboardNotFound =
    errorPage?.status === 404 || errorPage?.status === 400;

  if (!dashboardId || isDashboardNotFound) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <DashboardNotFoundError id={dashboardId} />
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
        if (isDashboardDirty) {
          show({
            title: t`Save your changes?`,
            message: t`You’ll need to save your changes before leaving to create a new question.`,
            confirmButtonText: t`Save changes`,
            onConfirm: async () => {
              /**
               * Dispatch the same actions as in the DashboardLeaveConfirmationModal.
               * @see {@link https://github.com/metabase/metabase/blob/4453fa8363eb37062a159f398050d050d91397a9/frontend/src/metabase/dashboard/components/DashboardLeaveConfirmationModal/DashboardLeaveConfirmationModal.tsx#L30-L34}
               */
              setRenderMode("queryBuilder");
              dispatch(dismissAllUndo());
              await dispatch(updateDashboardAndCards());
              // After saving the dashboard, it will exit the editing mode.
              dispatch(setEditingDashboard(dashboard));
            },
            confirmButtonProps: {
              color: "brand",
            },
          });
        } else {
          setRenderMode("queryBuilder");
        }
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
      dashcardMenu={finalDashcardMenu}
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
            <SdkAdHocQuestion
              // `adhocQuestionUrl` would have value if renderMode is "question"
              questionPath={adhocQuestionUrl!}
              onNavigateBack={onNavigateBackToDashboard}
              {...drillThroughQuestionProps}
            >
              {AdHocQuestionView && <AdHocQuestionView />}
            </SdkAdHocQuestion>
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
            onCreate={(question) => {
              setNewDashboardQuestionId(question.id);
              setRenderMode("dashboard");
              dashboardContextProviderRef.current?.refetchDashboard();
            }}
            onNavigateBack={() => {
              setRenderMode("dashboard");
            }}
            dataPickerProps={dataPickerProps}
          />
        ))
        .exhaustive()}
      {modalContent}
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

type DashboardQueryBuilderProps = {
  onCreate: (question: MetabaseQuestion) => void;
  onNavigateBack: () => void;
  dataPickerProps: EditableDashboardOwnProps["dataPickerProps"];
};

/**
 * The sole reason this is extracted into a separate component is to access the dashboard context
 */
function DashboardQueryBuilder({
  onCreate,
  onNavigateBack,
  dataPickerProps,
}: DashboardQueryBuilderProps) {
  const { dashboard, selectTab, setEditingDashboard } = useDashboardContext();

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
    <SdkQuestion
      questionId="new"
      targetDashboardId={dashboard.id}
      onSave={(question, { isNewQuestion, dashboardTabId }) => {
        if (isNewQuestion) {
          onCreate(question);
          if (dashboardTabId) {
            selectTab({ tabId: dashboardTabId });
          }
          setEditingDashboard(dashboard);
        }
      }}
      onNavigateBack={onNavigateBack}
      backToDashboard={dashboard}
      entityTypes={dataPickerProps?.entityTypes}
      withResetButton
      withChartTypeSelector
      // The default value is 600px and it cuts off the "Visualize" button.
      height="700px"
    />
  );
}
