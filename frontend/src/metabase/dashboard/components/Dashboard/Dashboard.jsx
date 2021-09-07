// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import DashboardControls from "../../hoc/DashboardControls";
import { DashboardSidebars } from "../DashboardSidebars";
import DashboardHeader from "../DashboardHeader";
import {
  DashboardStyled,
  DashboardLoadingAndErrorWrapper,
  DashboardBody,
  HeaderContainer,
  ParametersAndCardsContainer,
  ParametersWidgetContainer,
} from "./Dashboard.styled";
import DashboardGrid from "../DashboardGrid";
import ParametersWidget from "./ParametersWidget/ParametersWidget";
import DashboardEmptyState from "./DashboardEmptyState/DashboardEmptyState";
import { updateParametersWidgetStickiness } from "./stickyParameters";

const SCROLL_THROTTLE_INTERVAL = 1000 / 24;

// NOTE: move DashboardControls HoC to container
@DashboardControls
export default class Dashboard extends Component {
  state = {
    error: null,
    showAddQuestionSidebar: false,
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

    addCardOnLoad: PropTypes.func,
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

    onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
    onUpdateDashCardColumnSettings: PropTypes.func.isRequired,
    onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,

    onChangeLocation: PropTypes.func.isRequired,

    onSharingClick: PropTypes.func,
    onEmbeddingClick: PropTypes.any,
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
      if (addCardOnLoad != null) {
        // if we destructure this.props.dashboard, for some reason
        // if will render dashboards as empty
        this.setEditing(this.props.dashboard);
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

    this.setState({
      showAddQuestionSidebar: false,
    });
  };

  setDashboardAttribute = (attribute, value) => {
    this.props.setDashboardAttributes({
      id: this.props.dashboard.id,
      attributes: { [attribute]: value },
    });
  };

  onToggleAddQuestionSidebar = () => {
    this.setState(prev => ({
      showAddQuestionSidebar: !prev.showAddQuestionSidebar,
    }));
  };

  onCancel = () => {
    this.props.setSharing(false);
  };

  onSharingClick = () => {
    this.props.setSharing(true);
  };

  onEmbeddingClick = () => {};

  render() {
    const {
      addParameter,
      dashboard,
      isEditing,
      isFullscreen,
      isNightMode,
      isSharing,
    } = this.props;

    const {
      error,
      isParametersWidgetSticky,
      showAddQuestionSidebar,
    } = this.state;

    const shouldRenderAsNightMode = isNightMode && isFullscreen;
    const dashboardHasCards = dashboard => dashboard.ordered_cards.length > 0;

    const parametersWidget = (
      <ParametersWidget
        shouldRenderAsNightMode={shouldRenderAsNightMode}
        {...this.props}
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
                onEmbeddingClick={this.onEmbeddingClick}
                onToggleAddQuestionSidebar={this.onToggleAddQuestionSidebar}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
            </HeaderContainer>

            <DashboardBody isEditingOrSharing={isEditing || isSharing}>
              <ParametersAndCardsContainer
                innerRef={element =>
                  (this.parametersAndCardsContainerRef = element)
                }
              >
                {!isFullscreen && parametersWidget && (
                  <ParametersWidgetContainer
                    innerRef={element => (this.parametersWidgetRef = element)}
                    isSticky={isParametersWidgetSticky}
                  >
                    {parametersWidget}
                  </ParametersWidgetContainer>
                )}

                <FullWidthContainer>
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
                </FullWidthContainer>
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
