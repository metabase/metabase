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

  static getDerivedStateFromProps({ parameters }, { parametersListLength }) {
    const visibleParameters = getVisibleParameters(parameters);
    return visibleParameters.length !== parametersListLength
      ? { parametersListLength: visibleParameters.length }
      : null;
  }

  async componentDidMount() {
    await this.loadDashboard();
  }

  async componentDidUpdate(prevProps) {
    updateParametersWidgetStickiness(this);

    if (prevProps.dashboardId !== this.props.dashboardId) {
      await this.loadDashboard();
      return;
    }

    if (!_.isEqual(prevProps.selectedTabId, this.props.selectedTabId)) {
      this.props.fetchDashboardCardData();
      this.props.fetchDashboardCardMetadata();
      return;
    }

    if (
      !_.isEqual(prevProps.parameterValues, this.props.parameterValues) ||
      !_.isEqual(prevProps.parameters, this.props.parameters) ||
      (!prevProps.dashboard && this.props.dashboard)
    ) {
      this.props.fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
  }

  async loadDashboard() {
    const p = this.props;
    p.initialize({ clearCache: !p.isNavigatingBackToDashboard });
    p.loadDashboardParams();

    const result = await p.fetchDashboard({
      dashId: p.dashboardId,
      queryParams: p.location.query,
      options: {
        clearCache: !p.isNavigatingBackToDashboard,
        preserveParameters: p.isNavigatingBackToDashboard,
      },
    });

    if (result.error) {
      p.setErrorPage(result.payload);
      return;
    }

    try {
      if (p.editingOnLoad) {
        this.setEditing(this.props.dashboard);
      }
      if (p.addCardOnLoad != null) {
        p.addCardToDashboard({
          dashId: p.dashboardId,
          cardId: p.addCardOnLoad,
          tabId: p.dashboard?.tabs[0]?.id ?? null,
        });
      }
    } catch (error) {
      if (error.status === 404) {
        p.setErrorPage({ ...error, context: "dashboard" });
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
    this.setEditing(this.props.dashboard);
    this.props.toggleSidebar(SIDEBAR_NAME.addQuestion);
  };

  shouldRenderAsNightMode() {
    return this.props.isNightMode && this.props.isFullscreen;
  }

  renderContent = () => {
    const p = this.props;
    const canWrite = p.dashboard?.can_write ?? false;
    const dashboardHasCards = p.dashboard?.dashcards.length > 0 ?? false;
    const tabHasCards =
      p.dashboard?.dashcards.filter(
        c =>
          p.selectedTabId !== undefined &&
          c.dashboard_tab_id === p.selectedTabId,
      ).length > 0 ?? false;

    if (!dashboardHasCards && !canWrite) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={this.shouldRenderAsNightMode()}
        />
      );
    }

    if (!dashboardHasCards) {
      return (
        <DashboardEmptyState
          dashboard={p.dashboard}
          isNightMode={this.shouldRenderAsNightMode()}
          addQuestion={this.onAddQuestion}
          closeNavbar={p.closeNavbar}
        />
      );
    }

    if (dashboardHasCards && !tabHasCards) {
      return (
        <DashboardEmptyStateWithoutAddPrompt
          isNightMode={this.shouldRenderAsNightMode()}
        />
      );
    }

    return (
      <DashboardGridConnected
        {...this.props}
        dashboard={p.dashboard}
        isNightMode={this.shouldRenderAsNightMode()}
        onEditingChange={this.setEditing}
      />
    );
  };

  render() {
    const p = this.props;
    const visibleParameters = getVisibleParameters(p.parameters);

    const parametersWidget = (
      <SyncedParametersList
        parameters={getValuePopulatedParameters(
          p.parameters,
          p.isAutoApplyFilters ? p.parameterValues : p.draftParameterValues,
        )}
        editingParameter={p.editingParameter}
        dashboard={p.dashboard}
        isFullscreen={p.isFullscreen}
        isNightMode={this.shouldRenderAsNightMode()}
        isEditing={p.isEditing}
        setParameterValue={p.setParameterValue}
        setParameterIndex={p.setParameterIndex}
        setEditingParameter={p.setEditingParameter}
      />
    );

    const shouldRenderParametersWidgetInViewMode =
      !p.isEditing && !p.isFullscreen && visibleParameters.length > 0;

    const shouldRenderParametersWidgetInEditMode =
      p.isEditing && visibleParameters.length > 0;

    const cardsContainerShouldHaveMarginTop =
      !shouldRenderParametersWidgetInViewMode &&
      (!p.isEditing || p.isEditingParameter);

    return (
      <DashboardLoadingAndErrorWrapper
        isFullHeight={p.isEditing || p.isSharing}
        isFullscreen={p.isFullscreen}
        isNightMode={this.shouldRenderAsNightMode()}
        loading={!p.dashboard}
        error={this.state.error}
      >
        {() => (
          <DashboardStyled>
            {p.isHeaderVisible && (
              <DashboardHeaderContainer
                isFullscreen={p.isFullscreen}
                isNightMode={this.shouldRenderAsNightMode()}
              >
                <DashboardHeader
                  {...this.props}
                  onEditingChange={this.setEditing}
                  setDashboardAttribute={this.setDashboardAttribute}
                  addParameter={p.addParameter}
                  parametersWidget={parametersWidget}
                  onSharingClick={this.onSharingClick}
                />

                {shouldRenderParametersWidgetInEditMode && (
                  <ParametersWidgetContainer
                    data-testid="edit-dashboard-parameters-widget-container"
                    isEditing={p.isEditing}
                  >
                    {parametersWidget}
                  </ParametersWidgetContainer>
                )}
              </DashboardHeaderContainer>
            )}

            <DashboardBody isEditingOrSharing={p.isEditing || p.isSharing}>
              <ParametersAndCardsContainer
                data-testid="dashboard-parameters-and-cards"
                shouldMakeDashboardHeaderStickyAfterScrolling={
                  !p.isFullscreen && (p.isEditing || p.isSharing)
                }
              >
                {shouldRenderParametersWidgetInViewMode && (
                  <ParametersWidgetContainer
                    data-testid="dashboard-parameters-widget-container"
                    isSticky={this.state.isParametersWidgetSticky}
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
