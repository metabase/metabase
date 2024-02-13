import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious, useUnmount } from "react-use";
import type { Route } from "react-router";
import _ from "underscore";
import type { Location } from "history";

import { isSmallScreen, getMainElement } from "metabase/lib/dom";

import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";

import type {
  Dashboard as IDashboard,
  DashboardId,
  DashCardDataMap,
  DashCardId,
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

import type Database from "metabase-lib/metadata/Database";
import type { UiParameter } from "metabase-lib/parameters/types";
import type Metadata from "metabase-lib/metadata/Metadata";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import { SIDEBAR_NAME } from "../../constants";
import { DashboardGridConnected } from "../DashboardGrid";
import { DashboardSidebars } from "../DashboardSidebars";

import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState/DashboardEmptyState";
import {
  CardsContainer,
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  DashboardHeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
} from "./Dashboard.styled";

type SuccessfulFetchDashboardResult = { payload: { dashboard: IDashboard } };
type FailedFetchDashboardResult = { error: unknown; payload: unknown };

type FetchDashboardResult =
  | SuccessfulFetchDashboardResult
  | FailedFetchDashboardResult;

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
  archiveDashboard: (id: DashboardId) => Promise<void>;

  onRefreshPeriodChange: (period: number | null) => void;
  setEditingDashboard: (dashboard: IDashboard) => void;
  setDashboardAttributes: (opts: {
    id: DashboardId;
    attributes: Partial<IDashboard>;
  }) => void;
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
    isHeaderVisible,
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

  const visibleParameters = useMemo(
    () => getVisibleParameters(parameters),
    [parameters],
  );

  const tabHasCards = useMemo(() => {
    if (!Array.isArray(dashboard?.dashcards)) {
      return false;
    }
    if (!selectedTabId) {
      return dashboard.dashcards.length > 0;
    }
    const tabDashCards = dashboard.dashcards.filter(
      dc => dc.dashboard_tab_id === selectedTabId,
    );
    return tabDashCards.length > 0;
  }, [dashboard, selectedTabId]);

  const canWrite = Boolean(dashboard?.can_write);
  const dashboardHasCards = dashboard?.dashcards.length > 0;
  const hasVisibleParameters = visibleParameters.length > 0;

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const shouldRenderParametersWidgetInViewMode =
    !isEditing && !isFullscreen && hasVisibleParameters;

  const shouldRenderParametersWidgetInEditMode =
    isEditing && hasVisibleParameters;

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
    (dashboard: IDashboard) => {
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
      parameters={getValuePopulatedParameters(
        parameters,
        isAutoApplyFilters ? parameterValues : draftParameterValues,
      )}
      editingParameter={editingParameter}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isEditing={isEditing}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
    />
  );

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
          {isHeaderVisible && (
            <DashboardHeaderContainer
              isFullscreen={isFullscreen}
              isNightMode={shouldRenderAsNightMode}
            >
              <DashboardHeader
                {...props}
                onEditingChange={handleSetEditing}
                setDashboardAttribute={handleSetDashboardAttribute}
                addParameter={addParameter}
                parametersWidget={parametersWidget}
                onSharingClick={handleToggleSharing}
              />

              {shouldRenderParametersWidgetInEditMode && (
                <ParametersWidgetContainer
                  data-testid="edit-dashboard-parameters-widget-container"
                  isEditing={!!isEditing}
                  hasScroll={false}
                  isSticky={false}
                >
                  {parametersWidget}
                </ParametersWidgetContainer>
              )}
            </DashboardHeaderContainer>
          )}

          <DashboardBody isEditingOrSharing={isEditing || isSharing}>
            <ParametersAndCardsContainer
              data-testid="dashboard-parameters-and-cards"
              shouldMakeDashboardHeaderStickyAfterScrolling={
                !isFullscreen && (isEditing || isSharing)
              }
            >
              {shouldRenderParametersWidgetInViewMode && (
                <ParametersWidgetContainer
                  data-testid="dashboard-parameters-widget-container"
                  isEditing={false}
                  hasScroll={hasScroll}
                  isSticky={isParametersWidgetContainersSticky(
                    visibleParameters.length,
                  )}
                >
                  {parametersWidget}
                  <FilterApplyButton />
                </ParametersWidgetContainer>
              )}

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
