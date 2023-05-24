// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { getMainElement } from "metabase/lib/dom";

import DashboardHeader from "metabase/dashboard/containers/DashboardHeader";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import FilterApplyButton from "metabase/parameters/components/FilterApplyButton";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import DashboardControls from "metabase/dashboard/hoc/DashboardControls";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import { DashboardSidebars } from "../DashboardSidebars";
import DashboardGrid from "../DashboardGrid";
import { SIDEBAR_NAME } from "../../constants";

import {
  CardsContainer,
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  HeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
} from "./Dashboard.styled";
import DashboardEmptyState from "./DashboardEmptyState/DashboardEmptyState";
import { updateParametersWidgetStickiness } from "./stickyParameters";

const SCROLL_THROTTLE_INTERVAL = 1000 / 24;

// NOTE: move DashboardControls HoC to container

class Dashboard extends Component {
  state = {
    error: null,
    isParametersWidgetSticky: false,
    parametersListLength: 0,
  };

  static propTypes = {
    loadDashboardParams: PropTypes.func,
    location: PropTypes.object,

    isFullscreen: PropTypes.bool,
    isNightMode: PropTypes.bool,
    isSharing: PropTypes.bool,
    isEditable: PropTypes.bool,
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isEditingParameter: PropTypes.bool.isRequired,
    isNavbarOpen: PropTypes.bool.isRequired,
    isHeaderVisible: PropTypes.bool,
    isAdditionalInfoVisible: PropTypes.bool,
    isNavigatingBackToDashboard: PropTypes.bool,

    dashboard: PropTypes.object,
    dashboardId: PropTypes.number,
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
    initialize: PropTypes.func.isRequired,
    onRefreshPeriodChange: PropTypes.func,
    saveDashboardAndCards: PropTypes.func.isRequired,
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
    embedOptions: PropTypes.object,
    isAutoApplyFilters: PropTypes.bool,
  };

  static defaultProps = {
    isEditable: true,
    isSharing: false,
  };

  constructor(props) {
    super(props);
    this.parametersWidgetRef = React.createRef();
    this.parametersAndCardsContainerRef = React.createRef();
  }

  static getDerivedStateFromProps({ parameters }, { parametersListLength }) {
    const visibleParameters = getVisibleParameters(parameters);
    return visibleParameters.length !== parametersListLength
      ? { parametersListLength: visibleParameters.length }
      : null;
  }

  throttleParameterWidgetStickiness = _.throttle(
    () => updateParametersWidgetStickiness(this),
    SCROLL_THROTTLE_INTERVAL,
  );

  // NOTE: all of these lifecycle methods should be replaced with DashboardData HoC in container
  async componentDidMount() {
    await this.loadDashboard(this.props.dashboardId);

    const main = getMainElement();
    main.addEventListener("scroll", this.throttleParameterWidgetStickiness, {
      passive: true,
    });
    main.addEventListener("resize", this.throttleParameterWidgetStickiness, {
      passive: true,
    });
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.dashboardId !== this.props.dashboardId) {
      await this.loadDashboard(this.props.dashboardId);
      this.throttleParameterWidgetStickiness();
    } else if (
      !_.isEqual(prevProps.parameterValues, this.props.parameterValues) ||
      (!prevProps.dashboard && this.props.dashboard)
    ) {
      this.props.fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();
    const main = getMainElement();
    main.removeEventListener("scroll", this.throttleParameterWidgetStickiness);
    main.removeEventListener("resize", this.throttleParameterWidgetStickiness);
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

    try {
      await fetchDashboard(dashboardId, location.query, {
        clearCache: !isNavigatingBackToDashboard,
      });
      if (editingOnLoad) {
        this.setEditing(this.props.dashboard);
      }
      if (addCardOnLoad != null) {
        addCardToDashboard({
          dashId: dashboardId,
          cardId: addCardOnLoad,
          tabId: this.props.dashboard.ordered_tabs[0]?.id ?? null,
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

  getDashboardWithFilteredCards = () => {
    if (!this.props.dashboard) {
      return;
    }

    return {
      ...this.props.dashboard,
      ordered_cards: this.props.dashboard.ordered_cards.filter(
        dc =>
          !this.props.selectedTabId ||
          dc.dashboard_tab_id === this.props.selectedTabId ||
          dc.dashboard_tab_id === null,
      ),
    };
  };

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
    this.props.setSharing(true);
  };

  onAddQuestion = () => {
    const { dashboard } = this.props;
    this.setEditing(dashboard);
    this.props.toggleSidebar(SIDEBAR_NAME.addQuestion);
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
      isNavbarOpen,
      editingParameter,
      setParameterValue,
      setParameterIndex,
      setEditingParameter,
      isHeaderVisible,
      embedOptions,
      isAutoApplyFilters,
    } = this.props;

    const { error, isParametersWidgetSticky } = this.state;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;
    const dashboardHasCards =
      this.getDashboardWithFilteredCards()?.ordered_cards.length > 0 ?? false;
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
              <HeaderContainer
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
              </HeaderContainer>
            )}

            <DashboardBody isEditingOrSharing={isEditing || isSharing}>
              <ParametersAndCardsContainer
                data-testid="dashboard-parameters-and-cards"
                ref={element => (this.parametersAndCardsContainerRef = element)}
              >
                {shouldRenderParametersWidgetInViewMode && (
                  <ParametersWidgetContainer
                    data-testid="dashboard-parameters-widget-container"
                    ref={element => (this.parametersWidgetRef = element)}
                    isNavbarOpen={isNavbarOpen}
                    isSticky={isParametersWidgetSticky}
                    topNav={embedOptions?.top_nav}
                  >
                    {parametersWidget}
                    <FilterApplyButton />
                  </ParametersWidgetContainer>
                )}

                <CardsContainer
                  addMarginTop={cardsContainerShouldHaveMarginTop}
                  id="Dashboard-Cards-Container"
                >
                  {dashboardHasCards ? (
                    <DashboardGrid
                      {...this.props}
                      dashboard={this.getDashboardWithFilteredCards()}
                      isNightMode={shouldRenderAsNightMode}
                      onEditingChange={this.setEditing}
                    />
                  ) : (
                    <DashboardEmptyState
                      isNightMode={shouldRenderAsNightMode}
                      addQuestion={this.onAddQuestion}
                      closeNavbar={this.props.closeNavbar}
                    />
                  )}
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

export default DashboardControls(Dashboard);
