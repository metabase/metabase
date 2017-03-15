import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";

import Parameters from "../containers/Parameters.jsx";

import screenfull from "screenfull";

import _ from "underscore";
import cx from "classnames";
import querystring from "querystring";

const TICK_PERIOD = 0.25; // seconds

export default class Dashboard extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null,

            isFullscreen: false,
            isNightMode: false,

            refreshPeriod: null,
            refreshElapsed: null
        };

        _.bindAll(this,
            "setRefreshPeriod", "tickRefreshClock",
            "setFullscreen", "setNightMode", "fullScreenChanged",
            "setEditing", "setDashboardAttribute",
        );
    }

    static propTypes = {
        isEditable: PropTypes.bool,
        isEditing: PropTypes.bool.isRequired,
        isEditingParameter: PropTypes.bool.isRequired,

        dashboard: PropTypes.object,
        cards: PropTypes.array,

        addCardToDashboard: PropTypes.func.isRequired,
        deleteDashboard: PropTypes.func.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchDashboard: PropTypes.func.isRequired,
        fetchRevisions: PropTypes.func.isRequired,
        revertToRevision: PropTypes.func.isRequired,
        saveDashboard: PropTypes.func.isRequired,
        setDashboardAttributes: PropTypes.func.isRequired,
        setEditingDashboard: PropTypes.func.isRequired,

        onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
        onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,

        onChangeLocation: PropTypes.func.isRequired,
    };

    static defaultProps = {
        isEditable: true
    };

    async componentDidMount() {
        this.loadDashboard(this.props.params.dashboardId);
    }

    componentDidUpdate() {
        this.updateParams();
        this._showNav(!this.state.isFullscreen);
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.params.dashboardId !== nextProps.params.dashboardId) {
            this.loadDashboard(nextProps.params.dashboardId);
        } else if (!_.isEqual(this.props.parameterValues, nextProps.parameterValues) || !this.props.dashboard) {
            this.props.fetchDashboardCardData({ reload: false, clear: true });
        }
    }

    componentWillMount() {
        if (screenfull.enabled) {
            document.addEventListener(screenfull.raw.fullscreenchange, this.fullScreenChanged);
        }
    }

    componentWillUnmount() {
        this._showNav(true);
        this._clearRefreshInterval();
        if (screenfull.enabled) {
            document.removeEventListener(screenfull.raw.fullscreenchange, this.fullScreenChanged);
        }
    }

    _showNav(show) {
        const nav = document.querySelector(".Nav");
        if (show && nav) {
            nav.classList.remove("hide");
        } else if (!show && nav) {
            nav.classList.add("hide");
        }
    }

    async loadDashboard(dashboardId) {
        this.props.initialize();

        this.loadParams();
        const { addCardOnLoad, fetchDashboard, fetchCards, addCardToDashboard, setErrorPage, location } = this.props;

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
                setErrorPage(error);
            } else {
                console.error(error);
                this.setState({ error });
            }
        }
    }

    loadParams() {
        let params = querystring.parse(window.location.hash.substring(1));
        let refresh = parseInt(params.refresh);
        this.setRefreshPeriod(Number.isNaN(refresh) || refresh === 0 ? null : refresh);
        this.setNightMode("night" in params);
        this.setFullscreen("fullscreen" in params);
    }

    updateParams() {
        let hashParams = {};
        if (this.state.refreshPeriod) {
            hashParams.refresh = this.state.refreshPeriod;
        }
        if (this.state.isFullscreen) {
            hashParams.fullscreen = true;
        }
        if (this.state.isNightMode) {
            hashParams.night = true;
        }
        let hash = querystring.stringify(hashParams).replace(/=true\b/g, "");
        hash = (hash ? "#" + hash : "");

        // setting window.location.hash = "" causes the page to reload for some reasonc
        if (hash !== window.location.hash) {
            history.replaceState(null, document.title, window.location.pathname + window.location.search + hash);
        }
    }

    _clearRefreshInterval() {
        if (this._interval != null) {
            clearInterval(this._interval);
        }
    }

    setRefreshPeriod(refreshPeriod) {
        this._clearRefreshInterval();
        if (refreshPeriod != null) {
            this._interval = setInterval(this.tickRefreshClock, TICK_PERIOD * 1000);
            this.setState({ refreshPeriod, refreshElapsed: 0 });
            MetabaseAnalytics.trackEvent("Dashboard", "Set Refresh", refreshPeriod);
        } else {
            this.setState({ refreshPeriod: null, refreshElapsed: null });
        }
    }

    setNightMode(isNightMode) {
        this.setState({ isNightMode });
    }

    setFullscreen(isFullscreen, browserFullscreen = true) {
        if (isFullscreen !== this.state.isFullscreen) {
            if (screenfull.enabled && browserFullscreen) {
                if (isFullscreen) {
                    screenfull.request();
                } else {
                    screenfull.exit();
                }
            }
            this.setState({ isFullscreen });
        }
    }

    fullScreenChanged() {
        this.setState({ isFullscreen: screenfull.isFullscreen });
    }

    setEditing(isEditing) {
        this.setRefreshPeriod(null);
        this.props.setEditingDashboard(isEditing);
    }

    setDashboardAttribute(attribute, value) {
        this.props.setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        });
    }

    async tickRefreshClock() {
        let refreshElapsed = (this.state.refreshElapsed || 0) + TICK_PERIOD;
        if (refreshElapsed >= this.state.refreshPeriod) {
            refreshElapsed = 0;

            await this.props.fetchDashboard(this.props.params.dashboardId, this.props.location.query);
            this.props.fetchDashboardCardData({ reload: true, clear: false });
        }
        this.setState({ refreshElapsed });
    }

    render() {
        let { dashboard, isEditing, editingParameter, parameterValues, location } = this.props;
        let { error, isFullscreen, isNightMode } = this.state;
        isNightMode = isNightMode && isFullscreen;

        let parameters;
        if (dashboard && dashboard.parameters && dashboard.parameters.length) {
            parameters = (
                <Parameters
                    className="ml1"
                    syncQueryString

                    isEditing={isEditing}
                    isFullscreen={isFullscreen}
                    isNightMode={isNightMode}

                    parameters={dashboard.parameters.map(p => ({ ...p, value: parameterValues[p.id] }))}
                    query={location.query}

                    editingParameter={editingParameter}
                    setEditingParameter={this.props.setEditingParameter}

                    setParameterName={this.props.setParameterName}
                    setParameterDefaultValue={this.props.setParameterDefaultValue}
                    removeParameter={this.props.removeParameter}
                    setParameterValue={this.props.setParameterValue}
                />
            );
        }

        return (
            <LoadingAndErrorWrapper style={{ minHeight: "100%" }} className={cx("Dashboard flex-full", { "Dashboard--fullscreen": isFullscreen, "Dashboard--night": isNightMode})} loading={!dashboard} error={error}>
            {() =>
                <div className="full" style={{ overflowX: "hidden" }}>
                    <header className="DashboardHeader relative z2">
                        <DashboardHeader
                            {...this.props}
                            isFullscreen={this.state.isFullscreen}
                            isNightMode={this.state.isNightMode}
                            refreshPeriod={this.state.refreshPeriod}
                            refreshElapsed={this.state.refreshElapsed}
                            setRefreshPeriod={this.setRefreshPeriod}
                            onFullscreenChange={this.setFullscreen}
                            onNightModeChange={this.setNightMode}
                            onEditingChange={this.setEditing}
                            setDashboardAttribute={this.setDashboardAttribute}
                            addParameter={this.props.addParameter}
                            parameters={parameters}
                        />
                    </header>
                    {!isFullscreen && parameters &&
                        <div className="wrapper flex flex-column align-start mt1 relative z2">
                            {parameters}
                        </div>
                    }
                    <div className="wrapper">

                        { dashboard.ordered_cards.length === 0 ?
                            <div className="absolute z1 top bottom left right flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">This dashboard is looking empty.</div>
                                <div className="text-normal text-grey-2">Add a question to start making it useful!</div>
                            </div>
                        :
                            <DashboardGrid
                                {...this.props}
                                isFullscreen={this.state.isFullscreen}
                                onEditingChange={this.setEditing}
                            />
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
