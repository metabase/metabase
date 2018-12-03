/* @flow */

// TODO: merge with metabase/dashboard/containers/Dashboard.jsx

import React, { Component } from "react";
import PropTypes from "prop-types";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import { t } from "c-3po";
import Parameters from "metabase/parameters/components/Parameters.jsx";

import DashboardControls from "../hoc/DashboardControls";

import _ from "underscore";
import cx from "classnames";

import type {
  LocationDescriptor,
  ApiError,
  QueryParams,
} from "metabase/meta/types";

import type {
  Card,
  CardId,
  VisualizationSettings,
} from "metabase/meta/types/Card";
import type {
  DashboardWithCards,
  DashboardId,
  DashCardId,
} from "metabase/meta/types/Dashboard";
import type { Revision, RevisionId } from "metabase/meta/types/Revision";
import type {
  Parameter,
  ParameterId,
  ParameterValues,
  ParameterOption,
} from "metabase/meta/types/Parameter";

type Props = {
  location: LocationDescriptor,

  dashboardId: DashboardId,
  dashboard: DashboardWithCards,
  cards: Card[],
  revisions: { [key: string]: Revision[] },

  isAdmin: boolean,
  isEditable: boolean,
  isEditing: boolean,
  isEditingParameter: boolean,

  parameters: Parameter[],
  parameterValues: ParameterValues,

  addCardOnLoad: DashboardId,

  initialize: () => Promise<void>,
  addCardToDashboard: ({ dashId: DashCardId, cardId: CardId }) => void,
  addTextDashCardToDashboard: ({ dashId: DashCardId }) => void,
  archiveDashboard: (dashboardId: DashboardId) => void,
  fetchCards: (filterMode?: string) => void,
  fetchDashboard: (dashboardId: DashboardId, queryParams: ?QueryParams) => void,
  fetchRevisions: ({ entity: string, id: number }) => void,
  revertToRevision: ({
    entity: string,
    id: number,
    revision_id: RevisionId,
  }) => void,
  saveDashboardAndCards: () => Promise<void>,
  setDashboardAttributes: ({ [attribute: string]: any }) => void,
  fetchDashboardCardData: (options: {
    reload: boolean,
    clear: boolean,
  }) => Promise<void>,

  setEditingParameter: (parameterId: ?ParameterId) => void,
  setEditingDashboard: (isEditing: boolean) => void,

  addParameter: (option: ParameterOption) => Promise<Parameter>,
  removeParameter: (parameterId: ParameterId) => void,
  setParameterName: (parameterId: ParameterId, name: string) => void,
  setParameterValue: (parameterId: ParameterId, value: string) => void,
  setParameterDefaultValue: (
    parameterId: ParameterId,
    defaultValue: string,
  ) => void,
  setParameterIndex: (parameterId: ParameterId, index: number) => void,

  editingParameter: ?Parameter,

  refreshPeriod: number,
  refreshElapsed: number,
  isFullscreen: boolean,
  isNightMode: boolean,

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

  onChangeLocation: string => void,
  setErrorPage: (error: ApiError) => void,
};

type State = {
  error: ?ApiError,
};

@DashboardControls
export default class Dashboard extends Component {
  props: Props;
  state: State = {
    error: null,
  };

  static propTypes = {
    isEditable: PropTypes.bool,
    isEditing: PropTypes.bool.isRequired,
    isEditingParameter: PropTypes.bool.isRequired,

    dashboard: PropTypes.object,
    cards: PropTypes.array,
    parameters: PropTypes.array,

    addCardToDashboard: PropTypes.func.isRequired,
    archiveDashboard: PropTypes.func.isRequired,
    fetchCards: PropTypes.func.isRequired,
    fetchDashboard: PropTypes.func.isRequired,
    fetchRevisions: PropTypes.func.isRequired,
    revertToRevision: PropTypes.func.isRequired,
    saveDashboardAndCards: PropTypes.func.isRequired,
    setDashboardAttributes: PropTypes.func.isRequired,
    setEditingDashboard: PropTypes.func.isRequired,

    onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
    onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,

    onChangeLocation: PropTypes.func.isRequired,
  };

  static defaultProps = {
    isEditable: true,
  };

  componentDidMount() {
    this.loadDashboard(this.props.dashboardId);
  }

  componentWillReceiveProps(nextProps: Props) {
    if (this.props.dashboardId !== nextProps.dashboardId) {
      this.loadDashboard(nextProps.dashboardId);
    } else if (
      !_.isEqual(this.props.parameterValues, nextProps.parameterValues) ||
      !this.props.dashboard
    ) {
      this.props.fetchDashboardCardData({ reload: false, clear: true });
    }
  }

  async loadDashboard(dashboardId: DashboardId) {
    this.props.initialize();

    this.props.loadDashboardParams();
    const {
      addCardOnLoad,
      fetchDashboard,
      fetchCards,
      addCardToDashboard,
      setErrorPage,
      location,
    } = this.props;

    try {
      await fetchDashboard(dashboardId, location.query);
      if (addCardOnLoad != null) {
        // we have to load our cards before we can add one
        await fetchCards();
        this.setEditing(true);
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

  setEditing = (isEditing: boolean) => {
    this.props.onRefreshPeriodChange(null);
    this.props.setEditingDashboard(isEditing);
  };

  setDashboardAttribute = (attribute: string, value: any) => {
    this.props.setDashboardAttributes({
      id: this.props.dashboard.id,
      attributes: { [attribute]: value },
    });
  };

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
    } = this.props;
    let { error } = this.state;
    isNightMode = isNightMode && isFullscreen;

    let parametersWidget;
    if (parameters && parameters.length > 0) {
      parametersWidget = (
        <Parameters
          syncQueryString
          isEditing={isEditing}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
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
        className={cx("Dashboard flex-full pb4", {
          "Dashboard--fullscreen": isFullscreen,
          "Dashboard--night": isNightMode,
        })}
        loading={!dashboard}
        error={error}
      >
        {() => (
          <div className="full" style={{ overflowX: "hidden" }}>
            <header className="DashboardHeader relative z2">
              <DashboardHeader
                {...this.props}
                onEditingChange={this.setEditing}
                setDashboardAttribute={this.setDashboardAttribute}
                addParameter={this.props.addParameter}
                parametersWidget={parametersWidget}
              />
            </header>
            {!isFullscreen &&
              parametersWidget && (
                <div className="wrapper flex flex-column align-start mt2 relative z2">
                  {parametersWidget}
                </div>
              )}
            <div className="wrapper">
              {dashboard.ordered_cards.length === 0 ? (
                <div className="absolute z1 top bottom left right flex flex-column layout-centered">
                  <span className="QuestionCircle">?</span>
                  <div className="text-normal mt3 mb1">
                    {t`This dashboard is looking empty.`}
                  </div>
                  <div className="text-normal text-light">
                    {t`Add a question to start making it useful!`}
                  </div>
                </div>
              ) : (
                <DashboardGrid
                  {...this.props}
                  onEditingChange={this.setEditing}
                />
              )}
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
