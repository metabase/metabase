// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import DashboardHeader from "../DashboardHeader";
import DashboardGrid from "../DashboardGrid";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Parameters from "metabase/parameters/components/Parameters/Parameters";
import EmptyState from "metabase/components/EmptyState";
import { DashboardSidebars } from "../DashboardSidebars";

import DashboardControls from "../../hoc/DashboardControls";

// NOTE: move DashboardControls HoC to container
@DashboardControls
export default class Dashboard extends Component {
  state = {
    error: null,
    showAddQuestionSidebar: false,
  };

  static propTypes = {
    isEditable: PropTypes.bool,
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isEditingParameter: PropTypes.bool.isRequired,

    dashboard: PropTypes.object,
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

    onSharingClick: PropTypes.func.isRequired,
    onEmbeddingClick: PropTypes.func.isRequired,
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
      dashboard,
      editingParameter,
      hideParameters,
      isEditing,
      isFullscreen,
      isNightMode,
      isSharing,
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
        loading={!dashboard}
        error={error}
      >
        {() => (
          <div
            className="full flex flex-column full-height"
            style={{ overflowX: "hidden" }}
          >
            <header className="DashboardHeader relative z2">
              <DashboardHeader
                {...this.props}
                onEditingChange={this.setEditing}
                setDashboardAttribute={this.setDashboardAttribute}
                addParameter={this.props.addParameter}
                parametersWidget={parametersWidget}
                onSharingClick={this.onSharingClick}
                onEmbeddingClick={this.onEmbeddingClick}
                onToggleAddQuestionSidebar={this.onToggleAddQuestionSidebar}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
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
                    <DashboardGrid
                      {...this.props}
                      onEditingChange={this.setEditing}
                    />
                  )}
                </div>
              </div>
              <DashboardSidebars
                {...this.props}
                onCancel={this.onCancel}
                showAddQuestionSidebar={showAddQuestionSidebar}
              />
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
