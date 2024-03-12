import type { Location } from "history";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import type {
  NewDashCardOpts,
  SetDashboardAttributesOpts,
} from "metabase/dashboard/actions";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import type {
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { isSmallScreen, getMainElement } from "metabase/lib/dom";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import type Metadata from "metabase-lib/metadata/Metadata";
import type { UiParameter } from "metabase-lib/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";
import type {
  Dashboard as IDashboard,
  DashboardId,
  DashCardDataMap,
  DashCardId,
  Database,
  DatabaseId,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
  CardId,
  DashboardTabId,
  ParameterMappingOptions,
  RowValue,
  VisualizationSettings,
  ValuesQueryType,
  ValuesSourceType,
  ValuesSourceConfig,
} from "metabase-types/api";
import type {
  DashboardSidebarName,
  SelectedTabId,
  State,
  StoreDashcard,
} from "metabase-types/store";

import { DASHBOARD_PDF_EXPORT_ROOT_ID, SIDEBAR_NAME } from "../../constants";
import { DashboardGridConnected } from "../DashboardGrid";
import { DashboardSidebars } from "../DashboardSidebars";

import {
  CardsContainer,
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  DashboardHeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
  FixedWidthContainer,
  ParametersFixedWidthContainer,
} from "./Dashboard.styled";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState/DashboardEmptyState";

interface DashboardProps {
  dashboardId: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isNavbarOpen: boolean;
  isEditing: boolean;
  isSharing: boolean;
  dashboardBeforeEditing: IDashboard | null;
  isEditingParameter: boolean;
  isDirty: boolean;
  dashboard: IDashboard;
  dashcardData: DashCardDataMap;
  slowCards: Record<DashCardId, unknown>;
  databases: Record<DatabaseId, Database>;
  editingParameter?: Parameter | null;
  parameters: UiParameter[];
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  draftParameterValues: Record<ParameterId, ParameterValueOrArray | null>;
  metadata: Metadata;
  loadingStartTime: number | null;
  clickBehaviorSidebarDashcard: StoreDashcard | null;
  isAddParameterPopoverOpen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  pageFavicon: string | null;
  documentTitle: string | undefined;
  isRunning: boolean;
  isLoadingComplete: boolean;
  isHeaderVisible: boolean;
  isAdditionalInfoVisible: boolean;
  selectedTabId: SelectedTabId;
  isAutoApplyFilters: boolean;
  isNavigatingBackToDashboard: boolean;
  addCardOnLoad?: DashCardId;
  editingOnLoad?: string | string[];
  location: Location;
  isNightMode: boolean;
  isFullscreen: boolean;
  hasNightModeToggle: boolean;
  refreshPeriod: number | null;

  initialize: (opts?: { clearCache?: boolean }) => void;
  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams?: Record<string, unknown>;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<FetchDashboardResult>;
  fetchDashboardCardData: (opts?: {
    reload?: boolean;
    clearCache?: boolean;
  }) => Promise<void>;
  fetchDashboardCardMetadata: () => Promise<void>;
  cancelFetchDashboardCardData: () => void;
  loadDashboardParams: () => void;
  addCardToDashboard: (opts: {
    dashId: DashboardId;
    cardId: CardId;
    tabId: DashboardTabId | null;
  }) => void;
  addHeadingDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addMarkdownDashCardToDashboard: (opts: NewDashCardOpts) => void;
  addLinkDashCardToDashboard: (opts: NewDashCardOpts) => void;
  archiveDashboard: (id: DashboardId) => Promise<void>;

  onRefreshPeriodChange: (period: number | null) => void;
  setEditingDashboard: (dashboard: IDashboard | null) => void;
  setDashboardAttributes: (opts: SetDashboardAttributesOpts) => void;
  setSharing: (isSharing: boolean) => void;
  toggleSidebar: (sidebarName: DashboardSidebarName) => void;
  closeSidebar: () => void;

  closeNavbar: () => void;
  setErrorPage: (error: unknown) => void;
  onChangeLocation: (location: Location) => void;

  addParameter: (option: ParameterMappingOptions) => void;
  setParameterName: (id: ParameterId, name: string) => void;
  setParameterIndex: (id: ParameterId, index: number) => void;
  setParameterValue: (id: ParameterId, value: RowValue) => void;
  setParameterDefaultValue: (id: ParameterId, value: RowValue) => void;
  setParameterValueToDefault: (id: ParameterId) => void;
  setParameterRequired: (id: ParameterId, value: boolean) => void;
  setEditingParameter: (id: ParameterId) => void;
  setParameterIsMultiSelect: (id: ParameterId, isMultiSelect: boolean) => void;
  setParameterQueryType: (id: ParameterId, queryType: ValuesQueryType) => void;
  setParameterSourceType: (
    id: ParameterId,
    sourceType: ValuesSourceType,
  ) => void;
  setParameterSourceConfig: (
    id: ParameterId,
    config: ValuesSourceConfig,
  ) => void;
  setParameterFilteringParameters: (parameters: ParameterId[]) => void;
  showAddParameterPopover: () => void;
  removeParameter: (id: ParameterId) => void;

  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  onUpdateDashCardColumnSettings: (
    id: DashCardId,
    columnKey: string,
    settings?: Record<string, unknown> | null,
  ) => void;
  getEmbeddedParameterVisibility: (
    slug: string,
  ) => EmbeddingParameterVisibility | null;
  updateDashboardAndCards: () => void;
  onFullscreenChange: (
    isFullscreen: boolean,
    browserFullscreen?: boolean,
  ) => void;

  onNightModeChange: () => void;
  setSidebar: (opts: { name: DashboardSidebarName }) => void;
  hideAddParameterPopover: () => void;
}

function DashboardInner(props: DashboardProps) {
  const {
    addCardOnLoad,
    addCardToDashboard,
    addParameter,
    cancelFetchDashboardCardData,
    closeNavbar,
    dashboard,
    dashboardId,
    draftParameterValues,
    editingOnLoad,
    editingParameter,
    fetchDashboard,
    fetchDashboardCardData,
    fetchDashboardCardMetadata,
    initialize,
    isAutoApplyFilters,
    isEditing,
    isFullscreen,
    isNavigatingBackToDashboard,
    isNightMode,
    isSharing,
    loadDashboardParams,
    location,
    onRefreshPeriodChange,
    parameterValues,
    parameters,
    selectedTabId,
    setDashboardAttributes,
    setEditingDashboard,
    setEditingParameter,
    setErrorPage,
    setParameterIndex,
    setParameterValue,
    setParameterValueToDefault,
    setSharing,
    toggleSidebar,
  } = props;

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasScroll, setHasScroll] = useState(getMainElement()?.scrollTop > 0);

  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const currentTabDashcards = useMemo(() => {
    if (!Array.isArray(dashboard?.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      dc => dc.dashboard_tab_id === selectedTabId,
    );
  }, [dashboard, selectedTabId]);

  const hiddenParameterSlugs = useMemo(() => {
    if (isEditing) {
      // All filters should be visible in edit mode
      return undefined;
    }

    const currentTabParameterIds = currentTabDashcards.flatMap(
      dc => dc.parameter_mappings?.map(pm => pm.parameter_id) ?? [],
    );
    const hiddenParameters = parameters.filter(
      parameter => !currentTabParameterIds.includes(parameter.id),
    );

    return hiddenParameters.map(p => p.slug).join(",");
  }, [parameters, currentTabDashcards, isEditing]);

  const visibleParameters = useMemo(
    () => getVisibleParameters(parameters, hiddenParameterSlugs),
    [parameters, hiddenParameterSlugs],
  );

  const canWrite = Boolean(dashboard?.can_write);
  const tabHasCards = currentTabDashcards.length > 0;
  const dashboardHasCards = dashboard?.dashcards.length > 0;
  const hasVisibleParameters = visibleParameters.length > 0;

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const handleSetDashboardAttribute = useCallback(
    <Key extends keyof IDashboard>(attribute: Key, value: IDashboard[Key]) => {
      setDashboardAttributes({
        id: dashboard.id,
        attributes: { [attribute]: value },
      });
    },
    [dashboard, setDashboardAttributes],
  );

  const handleSetEditing = useCallback(
    (dashboard: IDashboard | null) => {
      onRefreshPeriodChange(null);
      setEditingDashboard(dashboard);
    },
    [onRefreshPeriodChange, setEditingDashboard],
  );

  const handleAddQuestion = useCallback(() => {
    handleSetEditing(dashboard);
    toggleSidebar(SIDEBAR_NAME.addQuestion);
  }, [dashboard, toggleSidebar, handleSetEditing]);

  const handleToggleSharing = useCallback(() => {
    setSharing(!isSharing);
  }, [isSharing, setSharing]);

  const handleLoadDashboard = useCallback(
    async (dashboardId: DashboardId) => {
      initialize({ clearCache: !isNavigatingBackToDashboard });

      loadDashboardParams();

      const result = await fetchDashboard({
        dashId: dashboardId,
        queryParams: location.query,
        options: {
          clearCache: !isNavigatingBackToDashboard,
          preserveParameters: isNavigatingBackToDashboard,
        },
      });

      if (!isSuccessfulFetchDashboardResult(result)) {
        setErrorPage(result.payload);
        return;
      }

      try {
        const dashboard = result.payload.dashboard;
        if (editingOnLoad) {
          handleSetEditing(dashboard);
        }
        if (addCardOnLoad != null) {
          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId: dashboard.tabs?.[0]?.id ?? null,
          });
        }
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          setErrorPage({ ...error, context: "dashboard" });
        } else {
          console.error(error);
          setError(error);
        }
      }
    },
    [
      addCardOnLoad,
      addCardToDashboard,
      editingOnLoad,
      fetchDashboard,
      handleSetEditing,
      initialize,
      isNavigatingBackToDashboard,
      loadDashboardParams,
      location.query,
      setErrorPage,
    ],
  );

  useEffect(() => {
    if (previousDashboardId !== dashboardId) {
      handleLoadDashboard(dashboardId).then(() => {
        setIsInitialized(true);
      });
      return;
    }
    if (previousTabId !== selectedTabId) {
      fetchDashboardCardData();
      fetchDashboardCardMetadata();
      return;
    }
    const didDashboardLoad = !previousDashboard && dashboard;
    const didParameterValuesChange = !_.isEqual(
      previousParameterValues,
      parameterValues,
    );
    if (didDashboardLoad || didParameterValuesChange) {
      fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }, [
    dashboard,
    dashboardId,
    fetchDashboardCardData,
    fetchDashboardCardMetadata,
    handleLoadDashboard,
    parameterValues,
    previousDashboard,
    previousDashboardId,
    previousParameterValues,
    previousTabId,
    selectedTabId,
  ]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const node = getMainElement();

    const handleScroll = (event: any) => {
      setHasScroll(event.target.scrollTop > 0);
    };

    node.addEventListener("scroll", handleScroll, {
      capture: false,
      passive: true,
    });

    return () => node.removeEventListener("scroll", handleScroll);
  }, [isInitialized]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  const renderContent = () => {
    if (!dashboardHasCards && !canWrite) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
    if (!dashboardHasCards) {
      return (
        <DashboardEmptyState
          dashboard={dashboard}
          isNightMode={shouldRenderAsNightMode}
          addQuestion={handleAddQuestion}
          closeNavbar={closeNavbar}
        />
      );
    }
    if (dashboardHasCards && !tabHasCards) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
    return (
      <DashboardGridConnected
        {...props}
        isNightMode={shouldRenderAsNightMode}
        onEditingChange={handleSetEditing}
      />
    );
  };

  const parametersWidget = (
    <SyncedParametersList
      parameters={getValuePopulatedParameters({
        parameters,
        values: isAutoApplyFilters ? parameterValues : draftParameterValues,
      })}
      editingParameter={editingParameter}
      hideParameters={hiddenParameterSlugs}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isEditing={isEditing}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior
    />
  );

  const renderParameterList = () => {
    if (!hasVisibleParameters) {
      return null;
    }

    if (isEditing) {
      return (
        <ParametersWidgetContainer
          hasScroll
          isSticky
          isFullscreen={isFullscreen}
          isNightMode={shouldRenderAsNightMode}
          data-testid="edit-dashboard-parameters-widget-container"
        >
          <FixedWidthContainer
            isFixedWidth={dashboard?.width === "fixed"}
            data-testid="fixed-width-filters"
          >
            {parametersWidget}
          </FixedWidthContainer>
        </ParametersWidgetContainer>
      );
    }

    return (
      <ParametersWidgetContainer
        hasScroll={hasScroll}
        isFullscreen={isFullscreen}
        isNightMode={shouldRenderAsNightMode}
        isSticky={isParametersWidgetContainersSticky(visibleParameters.length)}
        data-testid="dashboard-parameters-widget-container"
      >
        <ParametersFixedWidthContainer
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          {parametersWidget}
          <FilterApplyButton />
        </ParametersFixedWidthContainer>
      </ParametersWidgetContainer>
    );
  };

  return (
    <DashboardLoadingAndErrorWrapper
      isFullHeight={isEditing || isSharing}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      loading={!dashboard}
      error={error}
    >
      {() => (
        <DashboardStyled>
          <DashboardHeaderContainer
            isFullscreen={isFullscreen}
            isNightMode={shouldRenderAsNightMode}
          >
            {/**
             * Do not conditionally render `<DashboardHeader />` as it calls
             * `useDashboardTabs` under the hood. This hook sets `selectedTabId`
             * in Redux state which kicks off a fetch for the dashboard cards.
             */}
            <DashboardHeader
              {...props}
              onEditingChange={handleSetEditing}
              setDashboardAttribute={handleSetDashboardAttribute}
              addParameter={addParameter}
              onSharingClick={handleToggleSharing}
            />
          </DashboardHeaderContainer>

          <DashboardBody isEditingOrSharing={isEditing || isSharing}>
            <ParametersAndCardsContainer
              id={DASHBOARD_PDF_EXPORT_ROOT_ID}
              data-testid="dashboard-parameters-and-cards"
              shouldMakeDashboardHeaderStickyAfterScrolling={
                !isFullscreen && (isEditing || isSharing)
              }
            >
              {renderParameterList()}
              <CardsContainer id="Dashboard-Cards-Container">
                {renderContent()}
              </CardsContainer>
            </ParametersAndCardsContainer>

            <DashboardSidebars
              {...props}
              setDashboardAttribute={handleSetDashboardAttribute}
              onCancel={() => setSharing(false)}
            />
          </DashboardBody>
        </DashboardStyled>
      )}
    </DashboardLoadingAndErrorWrapper>
  );
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

export const Dashboard = DashboardControls(DashboardInner);
