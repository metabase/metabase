import type { ReactNode } from "react";
import { Component } from "react";
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
  }) => Promise<{ error?: unknown; payload?: unknown }>;
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

interface DashboardState {
  error: unknown;
  parametersListLength: number;
  hasScroll: boolean;
}

class DashboardInner extends Component<DashboardProps, DashboardState> {
  state = {
    error: null,
    parametersListLength: 0,
    hasScroll: getMainElement()?.scrollTop > 0,
  };

  static defaultProps = {
    isSharing: false,
  };

  static getDerivedStateFromProps(
    { parameters }: DashboardProps,
    { parametersListLength }: DashboardState,
  ) {
    const visibleParameters = getVisibleParameters(parameters);
    return visibleParameters.length !== parametersListLength
      ? { parametersListLength: visibleParameters.length }
      : null;
  }

  async componentDidMount() {
    await this.loadDashboard(this.props.dashboardId);
    getMainElement().addEventListener("scroll", this.onMainScroll, {
      capture: false,
      passive: true,
    });
  }

  async componentDidUpdate(prevProps: DashboardProps) {
    if (prevProps.dashboardId !== this.props.dashboardId) {
      await this.loadDashboard(this.props.dashboardId);
      return;
    }

    if (!_.isEqual(prevProps.selectedTabId, this.props.selectedTabId)) {
      this.props.fetchDashboardCardData();
      this.props.fetchDashboardCardMetadata();
      return;
    }

    if (
      !_.isEqual(prevProps.parameterValues, this.props.parameterValues) ||
      (!prevProps.dashboard && this.props.dashboard)
    ) {
      this.props.fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
    getMainElement().removeEventListener("scroll", this.onMainScroll);
  }

  async loadDashboard(dashboardId: DashboardId) {
    const {
      editingOnLoad,
      addCardOnLoad,
      addCardToDashboard,
      fetchDashboard,
      initialize,
      loadDashboardParams,
      location,
      setErrorPage,
      isNavigatingBackToDashboard,
    } = this.props;

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

    if (result.error) {
      setErrorPage(result.payload);
      return;
    }

    try {
      if (editingOnLoad) {
        this.setEditing(this.props.dashboard);
      }
      if (addCardOnLoad != null) {
        addCardToDashboard({
          dashId: dashboardId,
          cardId: addCardOnLoad,
          tabId: this.props.dashboard.tabs?.[0]?.id ?? null,
        });
      }
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        setErrorPage({ ...error, context: "dashboard" });
      } else {
        console.error(error);
        this.setState({ error });
      }
    }
  }

  setEditing = (dashboard: IDashboard) => {
    this.props.onRefreshPeriodChange(null);
    this.props.setEditingDashboard(dashboard);
  };

  setDashboardAttribute = <Key extends keyof IDashboard>(
    attribute: Key,
    value: IDashboard[Key],
  ) => {
    this.props.setDashboardAttributes({
      id: this.props.dashboard.id,
      attributes: { [attribute]: value },
    });
  };

  onCancel = () => {
    this.props.setSharing(false);
  };

  onSharingClick = () => {
    this.props.setSharing(!this.props.isSharing);
  };

  onAddQuestion = () => {
    const { dashboard } = this.props;
    this.setEditing(dashboard);
    this.props.toggleSidebar(SIDEBAR_NAME.addQuestion);
  };

  onMainScroll = (event: any) => {
    this.setState({ hasScroll: event.target.scrollTop > 0 });
  };

  renderContent = () => {
    const { dashboard, selectedTabId, isNightMode, isFullscreen } = this.props;

    const canWrite = dashboard?.can_write ?? false;

    const dashboardHasCards = dashboard?.dashcards.length > 0 ?? false;

    const tabHasCards =
      dashboard?.dashcards.filter(
        c =>
          selectedTabId !== undefined && c.dashboard_tab_id === selectedTabId,
      ).length > 0 ?? false;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;

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
          addQuestion={this.onAddQuestion}
          closeNavbar={this.props.closeNavbar}
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
        {...this.props}
        dashboard={this.props.dashboard}
        isNightMode={shouldRenderAsNightMode}
        onEditingChange={this.setEditing}
      />
    );
  };

  render() {
    const {
      addParameter,
      dashboard,
      isEditing,
      isFullscreen,
      isNightMode,
      isSharing,
      parameters,
      parameterValues,
      draftParameterValues,
      editingParameter,
      setParameterValue,
      setParameterIndex,
      setEditingParameter,
      isHeaderVisible,
      isAutoApplyFilters,
    } = this.props;

    const { error, parametersListLength, hasScroll } = this.state;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;

    const visibleParameters = getVisibleParameters(parameters);
    const hasVisibleParameters = visibleParameters.length > 0;

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

    const shouldRenderParametersWidgetInViewMode =
      !isEditing && !isFullscreen && hasVisibleParameters;

    const shouldRenderParametersWidgetInEditMode =
      isEditing && hasVisibleParameters;

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
                  {...this.props}
                  onEditingChange={this.setEditing}
                  setDashboardAttribute={this.setDashboardAttribute}
                  addParameter={addParameter}
                  parametersWidget={parametersWidget}
                  onSharingClick={this.onSharingClick}
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
                      parametersListLength,
                    )}
                  >
                    {parametersWidget}
                    <FilterApplyButton />
                  </ParametersWidgetContainer>
                )}

                <CardsContainer id="Dashboard-Cards-Container">
                  {this.renderContent()}
                </CardsContainer>
              </ParametersAndCardsContainer>

              <DashboardSidebars
                {...this.props}
                onCancel={this.onCancel}
                setDashboardAttribute={this.setDashboardAttribute}
              />
            </DashboardBody>
          </DashboardStyled>
        )}
      </DashboardLoadingAndErrorWrapper>
    );
  }
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}

export const Dashboard = DashboardControls(DashboardInner);
