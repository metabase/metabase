// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
import { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { DashboardControls } from "metabase/dashboard/hoc/DashboardControls";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import { DashboardSidebars } from "../DashboardSidebars";
import { DashboardGridConnected } from "../DashboardGrid";
import { SIDEBAR_NAME } from "../../constants";

import {
  CardsContainer,
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  DashboardHeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
} from "./Dashboard.styled";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState/DashboardEmptyState";
import { updateParametersWidgetStickiness } from "./stickyParameters";

// NOTE: move DashboardControls HoC to container

class DashboardInner extends Component {
  state = {
    error: null,
    isParametersWidgetSticky: false,
    parametersListLength: 0,
  };

  static defaultProps = {
    isSharing: false,
  };

  constructor(props) {
    super(props);
  }

  static getDerivedStateFromProps({ parameters }, { parametersListLength }) {
    const visibleParameters = getVisibleParameters(parameters);
    return visibleParameters.length !== parametersListLength
      ? { parametersListLength: visibleParameters.length }
      : null;
  }

  async componentDidMount() {
    await this.loadDashboard(this.props.dashboardId);
  }

  async componentDidUpdate(prevProps) {
    updateParametersWidgetStickiness(this);

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
  }

  async loadDashboard(dashboardId) {
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
          tabId: this.props.dashboard.tabs[0]?.id ?? null,
        });
      }
    } catch (error) {
      if (error.status === 404) {
        setErrorPage({ ...error, context: "dashboard" });
      } else {
        console.error(error);
        this.setState({ error });
      }
    }
  }

  setEditing = isEditing => {
    this.props.onRefreshPeriodChange(null);
    this.props.setEditingDashboard(isEditing);
  };

  setDashboardAttribute = (attribute, value) => {
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
      isEditingParameter,
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

    const { error, isParametersWidgetSticky } = this.state;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;

    const visibleParameters = getVisibleParameters(parameters);

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
      !isEditing && !isFullscreen && visibleParameters.length > 0;

    const shouldRenderParametersWidgetInEditMode =
      isEditing && visibleParameters.length > 0;

    const cardsContainerShouldHaveMarginTop =
      !shouldRenderParametersWidgetInViewMode &&
      (!isEditing || isEditingParameter);

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
                    isEditing={isEditing}
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
                    isSticky={isParametersWidgetSticky}
                  >
                    {parametersWidget}
                    <FilterApplyButton />
                  </ParametersWidgetContainer>
                )}

                <CardsContainer
                  addMarginTop={cardsContainerShouldHaveMarginTop}
                  id="Dashboard-Cards-Container"
                >
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

DashboardInner.propTypes = {
  loadDashboardParams: PropTypes.func,
  location: PropTypes.object,

  isAdmin: PropTypes.bool,
  isFullscreen: PropTypes.bool,
  isNightMode: PropTypes.bool,
  isSharing: PropTypes.bool,
  isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]).isRequired,
  isEditingParameter: PropTypes.bool.isRequired,
  isNavbarOpen: PropTypes.bool.isRequired,
  isHeaderVisible: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  isNavigatingBackToDashboard: PropTypes.bool,

  dashboard: PropTypes.object,
  dashboardId: PropTypes.number,
  dashcardData: PropTypes.object,
  selectedTabId: PropTypes.number,
  parameters: PropTypes.array,
  parameterValues: PropTypes.object,
  draftParameterValues: PropTypes.object,
  editingParameter: PropTypes.object,

  editingOnLoad: PropTypes.bool,
  addCardOnLoad: PropTypes.number,
  addCardToDashboard: PropTypes.func.isRequired,
  addParameter: PropTypes.func,
  archiveDashboard: PropTypes.func.isRequired,
  cancelFetchDashboardCardData: PropTypes.func.isRequired,
  fetchDashboard: PropTypes.func.isRequired,
  fetchDashboardCardData: PropTypes.func.isRequired,
  fetchDashboardCardMetadata: PropTypes.func.isRequired,
  initialize: PropTypes.func.isRequired,
  onRefreshPeriodChange: PropTypes.func,
  updateDashboardAndCards: PropTypes.func.isRequired,
  setDashboardAttributes: PropTypes.func.isRequired,
  setEditingDashboard: PropTypes.func.isRequired,
  setErrorPage: PropTypes.func,
  setSharing: PropTypes.func.isRequired,
  setParameterValue: PropTypes.func.isRequired,
  setEditingParameter: PropTypes.func.isRequired,
  setParameterIndex: PropTypes.func.isRequired,

  onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardColumnSettings: PropTypes.func.isRequired,
  onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,

  onChangeLocation: PropTypes.func.isRequired,
  onSharingClick: PropTypes.func,
  onEmbeddingClick: PropTypes.any,
  sidebar: PropTypes.shape({
    name: PropTypes.string,
    props: PropTypes.object,
  }).isRequired,
  toggleSidebar: PropTypes.func.isRequired,
  closeSidebar: PropTypes.func.isRequired,
  closeNavbar: PropTypes.func.isRequired,
  isAutoApplyFilters: PropTypes.bool,
};

export const Dashboard = DashboardControls(DashboardInner);
