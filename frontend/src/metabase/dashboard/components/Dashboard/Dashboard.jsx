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

// NOTE: move DashboardControls HoC to container
@DashboardControls
export default class Dashboard extends Component {
  state = {
    error: null,
    showAddQuestionSidebar: false,
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
    parameters: PropTypes.array,

    addCardToDashboard: PropTypes.func.isRequired,
    archiveDashboard: PropTypes.func.isRequired,
    fetchDashboard: PropTypes.func.isRequired,
    saveDashboardAndCards: PropTypes.func.isRequired,
    setDashboardAttributes: PropTypes.func.isRequired,
    setEditingDashboard: PropTypes.func.isRequired,
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

  // NOTE: all of these lifecycle methods should be replaced with DashboardData HoC in container
  componentDidMount() {
    this.loadDashboard(this.props.dashboardId);
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
<<<<<<< HEAD
      addParameter,
      dashboard,
=======
      dashboard,
      editingParameter,
      hideParameters,
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
      isEditing,
      isFullscreen,
      isNightMode,
      isSharing,
<<<<<<< HEAD
    } = this.props;

    const { error, showAddQuestionSidebar } = this.state;

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
=======
      location,
      parameterValues,
      parameters,
      removeParameter,
      setEditingParameter,
      setParameterDefaultValue,
      setParameterIndex,
      setParameterName,
      setParameterValue,
    } = this.props;

    const { error, showAddQuestionSidebar } = this.state;
    const shouldRenderAsNightMode = isNightMode && isFullscreen;

    let parametersWidget;
    if (parameters && parameters.length > 0) {
      parametersWidget = (
        <Parameters
          syncQueryString
          dashboard={dashboard}
          isEditing={isEditing}
          isFullscreen={isFullscreen}
          isNightMode={shouldRenderAsNightMode}
          hideParameters={hideParameters}
          parameters={parameters.map(p => ({
            ...p,
            value: parameterValues[p.id],
          }))}
          query={location.query}
          editingParameter={editingParameter}
          setEditingParameter={setEditingParameter}
          setParameterName={setParameterName}
          setParameterIndex={setParameterIndex}
          setParameterDefaultValue={setParameterDefaultValue}
          removeParameter={removeParameter}
          setParameterValue={setParameterValue}
        />
      );
    }

    return (
      <LoadingAndErrorWrapper
        className={cx("Dashboard flex-full", {
          "Dashboard--fullscreen": isFullscreen,
          "Dashboard--night": shouldRenderAsNightMode,
          // prevents header from scrolling so we can have a fixed sidebar
          "full-height": isEditing || isSharing,
        })}
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
        loading={!dashboard}
        error={error}
      >
        {() => (
<<<<<<< HEAD
          <DashboardStyled>
            <HeaderContainer
              isFullscreen={isFullscreen}
              isNightMode={shouldRenderAsNightMode}
            >
=======
          <div
            className="full flex flex-column full-height"
            style={{ overflowX: "hidden" }}
          >
            <header className="DashboardHeader relative z2">
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
              <DashboardHeader
                {...this.props}
                onEditingChange={this.setEditing}
                setDashboardAttribute={this.setDashboardAttribute}
<<<<<<< HEAD
                addParameter={addParameter}
=======
                addParameter={this.props.addParameter}
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
                parametersWidget={parametersWidget}
                onSharingClick={this.onSharingClick}
                onEmbeddingClick={this.onEmbeddingClick}
                onToggleAddQuestionSidebar={this.onToggleAddQuestionSidebar}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
<<<<<<< HEAD
            </HeaderContainer>

            <DashboardBody isEditingOrSharing={isEditing || isSharing}>
              <ParametersAndCardsContainer>
                {!isFullscreen && parametersWidget && (
                  <ParametersWidgetContainer>
                    {parametersWidget}
                  </ParametersWidgetContainer>
                )}

                <FullWidthContainer>
                  {dashboardHasCards(dashboard) ? (
=======
            </header>
            <div
              className={cx("flex shrink-below-content-size flex-full", {
                "flex-basis-none": isEditing || isSharing,
              })}
            >
              <div className="flex-auto overflow-x-hidden">
                {!isFullscreen && parametersWidget && (
                  <div className="wrapper flex flex-column align-start mt2 relative z2">
                    {parametersWidget}
                  </div>
                )}
                <div className="wrapper">
                  {dashboard.ordered_cards.length === 0 ? (
                    <Box
                      mt={[2, 4]}
                      color={shouldRenderAsNightMode ? "white" : "inherit"}
                    >
                      <EmptyState
                        illustrationElement={
                          <span className="QuestionCircle">?</span>
                        }
                        title={t`This dashboard is looking empty.`}
                        message={t`Add a question to start making it useful!`}
                      />
                    </Box>
                  ) : (
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
                    <DashboardGrid
                      {...this.props}
                      onEditingChange={this.setEditing}
                    />
<<<<<<< HEAD
                  ) : (
                    <DashboardEmptyState
                      isNightMode={shouldRenderAsNightMode}
                    />
                  )}
                </FullWidthContainer>
              </ParametersAndCardsContainer>

=======
                  )}
                </div>
              </div>
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
              <DashboardSidebars
                {...this.props}
                onCancel={this.onCancel}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
<<<<<<< HEAD
            </DashboardBody>
          </DashboardStyled>
        )}
      </DashboardLoadingAndErrorWrapper>
=======
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
>>>>>>> cb89393c9 (Create unit test file for Dashboard)
    );
  }
}
