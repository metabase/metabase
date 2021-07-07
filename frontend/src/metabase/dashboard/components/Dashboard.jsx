// TODO: merge with metabase/dashboard/containers/Dashboard.jsx
/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";

import DashboardHeader from "./DashboardHeader";
import DashboardGrid from "./DashboardGrid";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { t } from "ttag";
import Parameters from "metabase/parameters/components/Parameters/Parameters";
import EmptyState from "metabase/components/EmptyState";
import { DashboardSidebars } from "./DashboardSidebars";

import DashboardControls from "../hoc/DashboardControls";

import _ from "underscore";
import cx from "classnames";

import type {
  LocationDescriptor,
  ApiError,
  QueryParams,
} from "metabase-types/types";

import type { CardId, VisualizationSettings } from "metabase-types/types/Card";
import type {
  DashboardWithCards,
  DashboardId,
  DashCardId,
} from "metabase-types/types/Dashboard";
import type { Revision } from "metabase-types/types/Revision";
import type {
  Parameter,
  ParameterId,
  ParameterValues,
  ParameterOption,
} from "metabase-types/types/Parameter";

type Props = {
  location: LocationDescriptor,

  dashboardId: DashboardId,
  dashboard: DashboardWithCards,
  dashboardBeforeEditing: ?DashboardWithCards,
  revisions: { [key: string]: Revision[] },

  isAdmin: boolean,
  isEditable: boolean,
  isEditing: boolean,
  isEditingParameter: boolean,
  isSharing: boolean,

  parameters: Parameter[],
  parameterValues: ParameterValues,

  addCardOnLoad: DashboardId,

  initialize: () => Promise<void>,
  addCardToDashboard: ({ dashId: DashCardId, cardId: CardId }) => void,
  addTextDashCardToDashboard: ({ dashId: DashCardId }) => void,
  archiveDashboard: (dashboardId: DashboardId) => void,
  fetchDashboard: (dashboardId: DashboardId, queryParams: ?QueryParams) => void,
  saveDashboardAndCards: () => Promise<void>,
  setDashboardAttributes: ({ [attribute: string]: any }) => void,
  fetchDashboardCardData: (options: {
    reload: boolean,
    clear: boolean,
  }) => Promise<void>,
  cancelFetchDashboardCardData: () => Promise<void>,

  setEditingParameter: (parameterId: ?ParameterId) => void,
  setEditingDashboard: (isEditing: false | DashboardWithCards) => void,
  setSharing: (isSharing: boolean) => void,

  addParameter: (option: ParameterOption) => Promise<Parameter>,
  removeParameter: (parameterId: ParameterId) => void,
  setParameterName: (parameterId: ParameterId, name: string) => void,
  setParameterValue: (parameterId: ParameterId, value: string) => void,
  setParameterDefaultValue: (
    parameterId: ParameterId,
    defaultValue: string,
  ) => void,
  setParameterIndex: (parameterId: ParameterId, index: number) => void,
  isAddParameterPopoverOpen: boolean,
  showAddParameterPopover: () => void,
  hideAddParameterPopover: () => void,

  editingParameter: ?Parameter,

  refreshPeriod: number,
  setRefreshElapsedHook: Function,
  isFullscreen: boolean,
  isNightMode: boolean,
  hideParameters: ?string,

  onRefreshPeriodChange: (?number) => void,
  onNightModeChange: boolean => void,
  onFullscreenChange: boolean => void,

  loadDashboardParams: () => void,

  onReplaceAllDashCardVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void,
  onUpdateDashCardVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void,
  onUpdateDashCardColumnSettings: (
    dashcardId: DashCardId,
    column: any,
    settings: VisualizationSettings,
  ) => void,

  onChangeLocation: string => void,
  setErrorPage: (error: ApiError) => void,

  onCancel: () => void,
  onSharingClick: () => void,
  onEmbeddingClick: () => void,
};

type State = {
  error: ?ApiError,
};

// NOTE: move DashboardControls HoC to container
@DashboardControls
export default class Dashboard extends Component {
  props: Props;
  state: State = {
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

  UNSAFE_componentWillReceiveProps(nextProps: Props) {
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

  async loadDashboard(dashboardId: DashboardId) {
    this.props.initialize();

    this.props.loadDashboardParams();
    const {
      addCardOnLoad,
      fetchDashboard,
      addCardToDashboard,
      setErrorPage,
      location,
    } = this.props;

    try {
      await fetchDashboard(dashboardId, location.query);
      if (addCardOnLoad != null) {
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

  setEditing = (isEditing: false | DashboardWithCards) => {
    this.props.onRefreshPeriodChange(null);
    this.props.setEditingDashboard(isEditing);

    this.setState({
      showAddQuestionSidebar: false,
    });
  };

  setDashboardAttribute = (attribute: string, value: any) => {
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
    let {
      dashboard,
      isEditing,
      editingParameter,
      parameters,
      parameterValues,
      location,
      isFullscreen,
      isNightMode,
      isSharing,
      hideParameters,
    } = this.props;
    const { error, showAddQuestionSidebar } = this.state;
    isNightMode = isNightMode && isFullscreen;

    let parametersWidget;
    if (parameters && parameters.length > 0) {
      parametersWidget = (
        <Parameters
          syncQueryString
          dashboard={dashboard}
          isEditing={isEditing}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          hideParameters={hideParameters}
          parameters={parameters.map(p => ({
            ...p,
            value: parameterValues[p.id],
          }))}
          query={location.query}
          editingParameter={editingParameter}
          setEditingParameter={this.props.setEditingParameter}
          setParameterName={this.props.setParameterName}
          setParameterIndex={this.props.setParameterIndex}
          setParameterDefaultValue={this.props.setParameterDefaultValue}
          removeParameter={this.props.removeParameter}
          setParameterValue={this.props.setParameterValue}
        />
      );
    }

    return (
      <LoadingAndErrorWrapper
        className={cx("Dashboard flex-full", {
          "Dashboard--fullscreen": isFullscreen,
          "Dashboard--night": isNightMode,
          "full-height": isEditing || isSharing, // prevents header from scrolling so we can have a fixed sidebar
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
                    <Box mt={[2, 4]} color={isNightMode ? "white" : "inherit"}>
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
