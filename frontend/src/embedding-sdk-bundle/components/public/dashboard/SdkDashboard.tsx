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
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { useSdkInternalNavigationOptional } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { useDashboardLoadHandlers } from "embedding-sdk-bundle/hooks/private/use-dashboard-load-handlers";
import { useExtractResourceIdFromJwtToken } from "embedding-sdk-bundle/hooks/private/use-extract-resource-id-from-jwt-token";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk-bundle/hooks/private/use-sdk-dashboard-params";
import { useSetupContentTranslations } from "embedding-sdk-bundle/hooks/private/use-setup-content-translations";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import type { MetabaseQuestion } from "embedding-sdk-bundle/types";
import type {
  DashboardEventHandlersProps,
  SdkDashboardId,
} from "embedding-sdk-bundle/types/dashboard";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { useConfirmation } from "metabase/common/hooks";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  closeSidebarIfSubscriptionsSidebarOpen,
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
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { isStaticEmbeddingEntityLoadingError } from "metabase/lib/errors/is-static-embedding-entity-loading-error";
import { useSelector } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { resetErrorPage, setErrorPage } from "metabase/redux/app";
import { dismissAllUndo } from "metabase/redux/undo";
import { getErrorPage } from "metabase/selectors/app";
import type { CardDisplayType } from "metabase-types/api";

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

    /**
     * The ID of the dashboard.
     *  <br/>
     * This is either:
     *  <br/>
     *  - the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
     *  <br/>
     *  - the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data
     */
    dashboardId: SdkDashboardId;

    /**
     * Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.
     * <br/>
     * - Combining {@link SdkDashboardProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to filter data on the frontend is a [security risk](https://www.metabase.com/docs/latest/embedding/sdk/authentication.html#security-warning-each-end-user-must-have-their-own-metabase-account).
     * <br/>
     * - Combining {@link SdkDashboardProps.initialParameters | initialParameters} and {@link SdkDashboardDisplayProps.hiddenParameters | hiddenParameters} to declutter the user interface is fine.
     */
    initialParameters?: ParameterValues;
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
  dashboardId: rawDashboardId,
  token: rawToken,
  initialParameters = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = false,
  withSubscriptions = false,
  hiddenParameters = [],
  enableEntityNavigation = false,
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
  navigateToNewCardFromDashboard,
  className,
  style,
  children,
  dataPickerProps,
  onVisualizationChange,
}: SdkDashboardInnerProps) => {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);
  const internalNavigation = useSdkInternalNavigationOptional();

  const {
    resourceId: dashboardId,
    token,
    tokenError,
  } = useExtractResourceIdFromJwtToken({
    isGuestEmbed,
    resourceId: rawDashboardId,
    token: rawToken ?? undefined,
  });

  useSetupContentTranslations({ token });

  const { handleLoad, handleLoadWithoutCards } = useDashboardLoadHandlers({
    onLoad,
    onLoadWithoutCards,
  });

  const { isLocaleLoading } = useLocale();
  const { isBreadcrumbEnabled, reportLocation } = useSdkBreadcrumbs();

  const { displayOptions } = useSdkDashboardParams({
    withDownloads,
    withSubscriptions,
    withTitle,
    withCardTitle,
    hiddenParameters,
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

  useEffect(() => {
    if (dashboard && isBreadcrumbEnabled && finalRenderMode === "dashboard") {
      reportLocation({
        type: "dashboard",
        id: dashboard.id,
        name: dashboard.name,
        onNavigate: onNavigateBackToDashboard,
      });
    }
  }, [
    dashboard,
    isBreadcrumbEnabled,
    reportLocation,
    finalRenderMode,
    onNavigateBackToDashboard,
  ]);

  const errorPage = useSdkSelector(getErrorPage);
  const dispatch = useSdkDispatch();
  useEffect(() => {
    if (dashboardId) {
      dispatch(resetErrorPage());
    }
  }, [dispatch, dashboardId]);

  useEffect(() => {
    if (!withSubscriptions) {
      dispatch(closeSidebarIfSubscriptionsSidebarOpen());
    }
  }, [dispatch, withSubscriptions]);

  const { modalContent, show } = useConfirmation();
  const isDashboardDirty = useSelector(getIsDirty);

  if (isLocaleLoading) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkLoader />
      </SdkDashboardStyledWrapper>
    );
  }

  if (tokenError) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkError message={tokenError} />;
      </SdkDashboardStyledWrapper>
    );
  }

  if (isStaticEmbeddingEntityLoadingError(errorPage, { isGuestEmbed })) {
    return (
      <SdkDashboardStyledWrapper className={className} style={style}>
        <SdkError message={errorPage.data ?? t`Something's gone wrong`} />
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
        <DashboardNotFoundError id={dashboardId ?? ""} />
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
    <EmbeddingEntityContextProvider uuid={null} token={token}>
      <DashboardContextProvider
        ref={dashboardContextProviderRef}
        dashboardId={dashboardId}
        isGuestEmbed={isGuestEmbed}
        parameterQueryParams={initialParameters}
        navigateToNewCardFromDashboard={
          navigateToNewCardFromDashboard !== undefined
            ? navigateToNewCardFromDashboard
            : onNavigateToNewCardFromDashboard
        }
        onNewQuestion={() => {
          const openNewQuestion = () => {
            if (internalNavigation && dashboard) {
              // Use the navigation stack when inside SdkInternalNavigationProvider
              internalNavigation.push({
                type: "new-question",
                dashboardId: dashboard.id,
                dashboardName: dashboard.name,
                name: dashboard.name,
                dataPickerProps,
                onQuestionCreated: (question) => {
                  setNewDashboardQuestionId(question.id);
                  dashboardContextProviderRef.current?.refetchDashboard();
                },
              });
            } else {
              // Fall back to local state when not inside navigation provider
              setRenderMode("queryBuilder");
            }
          };

          if (isDashboardDirty) {
            show({
              title: t`Save your changes?`,
              message: t`You'll need to save your changes before leaving to create a new question.`,
              confirmButtonText: t`Save changes`,
              onConfirm: async () => {
                /**
                 * Dispatch the same actions as in the DashboardLeaveConfirmationModal.
                 * @see {@link https://github.com/metabase/metabase/blob/4453fa8363eb37062a159f398050d050d91397a9/frontend/src/metabase/dashboard/components/DashboardLeaveConfirmationModal/DashboardLeaveConfirmationModal.tsx#L30-L34}
                 */
                openNewQuestion();
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
            openNewQuestion();
          }
        }}
        downloadsEnabled={displayOptions.downloadsEnabled}
        withSubscriptions={displayOptions.withSubscriptions}
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
        enableEntityNavigation={enableEntityNavigation}
      >
        {match({ finalRenderMode, isGuestEmbed })
          .with({ finalRenderMode: "question" }, () => (
            <SdkDashboardStyledWrapperWithRef
              className={className}
              style={style}
            >
              <SdkAdHocQuestion
                // `adhocQuestionUrl` would have value if renderMode is "question"
                questionPath={adhocQuestionUrl!}
                onNavigateBack={onNavigateBackToDashboard}
                {...drillThroughQuestionProps}
                onVisualizationChange={onVisualizationChange}
              >
                {AdHocQuestionView && <AdHocQuestionView />}
              </SdkAdHocQuestion>
            </SdkDashboardStyledWrapperWithRef>
          ))
          .with({ finalRenderMode: "dashboard" }, () => (
            <SdkDashboardProvider
              plugins={plugins}
              onEditQuestion={onEditQuestion}
            >
              {children ?? (
                <SdkDashboardStyledWrapperWithRef
                  className={className}
                  style={style}
                >
                  {/* <SdkInternalNavigationBackButton
                    style={{ border: "5px solid yellow" }}
                  /> */}
                  <Dashboard className={EmbedFrameS.EmbedFrame} />
                </SdkDashboardStyledWrapperWithRef>
              )}
            </SdkDashboardProvider>
          ))
          .with({ finalRenderMode: "queryBuilder" }, ({ isGuestEmbed }) =>
            isGuestEmbed ? (
              <SdkDashboardStyledWrapper className={className} style={style}>
                <SdkError
                  message={t`You can't save questions in Guest Embed mode`}
                />
              </SdkDashboardStyledWrapper>
            ) : (
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
                onVisualizationChange={onVisualizationChange}
              />
            ),
          )
          .exhaustive()}
        {modalContent}
      </DashboardContextProvider>
    </EmbeddingEntityContextProvider>
  );
};

export const SdkDashboard = withPublicComponentWrapper(SdkDashboardInner, {
  supportsGuestEmbed: true,
}) as typeof SdkDashboardInner &
  Pick<
    typeof Dashboard,
    | "Grid"
    | "Header"
    | "Title"
    | "Tabs"
    | "ParametersList"
    | "FullscreenButton"
    | "ExportAsPdfButton"
    | "SubscriptionsButton"
    | "InfoButton"
    | "RefreshPeriod"
  >;

SdkDashboard.Grid = Dashboard.Grid;
SdkDashboard.Header = Dashboard.Header;
SdkDashboard.Title = Dashboard.Title;
SdkDashboard.Tabs = Dashboard.Tabs;
SdkDashboard.ParametersList = Dashboard.ParametersList;
SdkDashboard.FullscreenButton = Dashboard.FullscreenButton;
SdkDashboard.ExportAsPdfButton = Dashboard.ExportAsPdfButton;
SdkDashboard.SubscriptionsButton = Dashboard.SubscriptionsButton;
SdkDashboard.InfoButton = Dashboard.InfoButton;
SdkDashboard.RefreshPeriod = Dashboard.RefreshPeriod;

type DashboardQueryBuilderProps = {
  onCreate: (question: MetabaseQuestion) => void;
  onNavigateBack: () => void;
  dataPickerProps: EditableDashboardOwnProps["dataPickerProps"];
  onVisualizationChange?: (display: CardDisplayType) => void;
};

/**
 * The sole reason this is extracted into a separate component is to access the dashboard context
 */
function DashboardQueryBuilder({
  onCreate,
  onNavigateBack,
  dataPickerProps,
  onVisualizationChange,
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
      backToDashboard={{
        model: "dashboard",
        id: dashboard.id,
        name: dashboard.name,
      }}
      entityTypes={dataPickerProps?.entityTypes}
      withChartTypeSelector
      // The default value is 600px and it cuts off the "Visualize" button.
      height="700px"
      onVisualizationChange={onVisualizationChange}
    />
  );
}
