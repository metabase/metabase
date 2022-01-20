// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import DashboardControls from "../../hoc/DashboardControls";
import { DashboardSidebars } from "../DashboardSidebars";
import DashboardHeader from "../DashboardHeader";
import {
  CardsContainer,
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  HeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
} from "./Dashboard.styled";
import DashboardGrid from "../DashboardGrid";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import DashboardEmptyState from "./DashboardEmptyState/DashboardEmptyState";
import { updateParametersWidgetStickiness } from "./stickyParameters";
import { getValuePopulatedParameters } from "metabase/parameters/utils/parameter-values";

const SCROLL_THROTTLE_INTERVAL = 1000 / 24;

// NOTE: move DashboardControls HoC to container
@DashboardControls
export default class Dashboard extends Component {
  state = {
    error: null,
    isParametersWidgetSticky: false,
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

    dashboard: PropTypes.object,
    dashboardId: PropTypes.number,
    parameters: PropTypes.array,
    parameterValues: PropTypes.object,
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
    closeSidebar: PropTypes.func.isRequired,
    openAddQuestionSidebar: PropTypes.func.isRequired,
    showAddQuestionSidebar: PropTypes.bool.isRequired,
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

  // NOTE: all of these lifecycle methods should be replaced with DashboardData HoC in container
  componentDidMount() {
    this.loadDashboard(this.props.dashboardId);

    const throttleParameterWidgetStickiness = _.throttle(
      () => updateParametersWidgetStickiness(this),
      SCROLL_THROTTLE_INTERVAL,
    );

    window.addEventListener("scroll", throttleParameterWidgetStickiness, {
      passive: true,
    });
    window.addEventListener("resize", throttleParameterWidgetStickiness, {
      passive: true,
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.dashboardId !== nextProps.dashboardId) {
      this.loadDashboard(nextProps.dashboardId);
    } else if (
      !_.isEqual(this.props.parameterValues, nextProps.parameterValues) ||
      !this.props.dashboard
    ) {
      this.props.fetchDashboardCardData({ reload: false, clear: true });
    }
  }

  componentWillUnmount() {
    this.props.cancelFetchDashboardCardData();

    window.removeEventListener("scroll", updateParametersWidgetStickiness);
    window.removeEventListener("resize", updateParametersWidgetStickiness);
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
    } = this.props;

    initialize();

    loadDashboardParams();

    try {
      await fetchDashboard(dashboardId, location.query);
      if (editingOnLoad) {
        this.setEditing(this.props.dashboard);
      }
      if (addCardOnLoad != null) {
        addCardToDashboard({ dashId: dashboardId, cardId: addCardOnLoad });
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

  onToggleAddQuestionSidebar = () => {
    if (this.props.showAddQuestionSidebar) {
      this.props.closeSidebar();
    } else {
      this.props.openAddQuestionSidebar();
    }
  };

  onCancel = () => {
    this.props.setSharing(false);
  };

  onSharingClick = () => {
    this.props.setSharing(true);
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
      showAddQuestionSidebar,
      parameterValues,
      editingParameter,
      setParameterValue,
      setParameterIndex,
      setEditingParameter,
    } = this.props;

    const { error, isParametersWidgetSticky } = this.state;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;
    const dashboardHasCards = dashboard => dashboard.ordered_cards.length > 0;

    const parametersWidget = (
      <SyncedParametersList
        parameters={getValuePopulatedParameters(parameters, parameterValues)}
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
      !isEditing && !isFullscreen && parameters.length > 0;

    const shouldRenderParametersWidgetInEditMode =
      isEditing && parameters.length > 0;

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
                onToggleAddQuestionSidebar={this.onToggleAddQuestionSidebar}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />

              {shouldRenderParametersWidgetInEditMode && (
                <ParametersWidgetContainer isEditing={isEditing}>
                  {parametersWidget}
                </ParametersWidgetContainer>
              )}
            </HeaderContainer>

            <DashboardBody isEditingOrSharing={isEditing || isSharing}>
              <ParametersAndCardsContainer
                data-testid="dashboard-parameters-and-cards"
                innerRef={element =>
                  (this.parametersAndCardsContainerRef = element)
                }
              >
                {shouldRenderParametersWidgetInViewMode && (
                  <ParametersWidgetContainer
                    innerRef={element => (this.parametersWidgetRef = element)}
                    isSticky={isParametersWidgetSticky}
                  >
                    {parametersWidget}
                  </ParametersWidgetContainer>
                )}

                <CardsContainer
                  addMarginTop={cardsContainerShouldHaveMarginTop}
                >
                  {dashboardHasCards(dashboard) ? (
                    <DashboardGrid
                      {...this.props}
                      onEditingChange={this.setEditing}
                    />
                  ) : (
                    <DashboardEmptyState
                      isNightMode={shouldRenderAsNightMode}
                    />
                  )}
                </CardsContainer>
              </ParametersAndCardsContainer>

              <DashboardSidebars
                {...this.props}
                onCancel={this.onCancel}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
            </DashboardBody>
          </DashboardStyled>
        )}
      </DashboardLoadingAndErrorWrapper>
    );
  }
}
