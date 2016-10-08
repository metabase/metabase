import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";

import ParameterWidget from "../containers/ParameterWidget.jsx";

import { createParameter, setParameterName, setParameterDefaultValue } from "metabase/meta/Dashboard";

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
            "addParameter"
        );
    }

    static propTypes = {
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
        setDashCardVisualizationSetting: PropTypes.func.isRequired,

        onChangeLocation: PropTypes.func.isRequired,
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
            this.fetchDashboardCardData(nextProps, { reload: false, clear: true });
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
        const { addCardOnLoad, fetchDashboard, fetchCards, addCardToDashboard, onChangeLocation, location } = this.props;

        try {
            await fetchDashboard(dashboardId, location.query);
            if (addCardOnLoad != null) {
                // we have to load our cards before we can add one
                await fetchCards();
                this.setEditing(true);
                addCardToDashboard({ dashId: dashboardId, cardId: addCardOnLoad });
            }
        } catch (error) {
            console.error(error)
            if (error.status === 404) {
                onChangeLocation("/404");
            } else {
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
        let params = "";
        let oldParams = "";

        // only perform this check if we've loaded the dashboard
        if (this.props.dashboard) {
            let parameters = this.props.dashboard.parameters || [];
            let queryParams = _.chain(this.props.parameterValues)
                .map((value, id) => ([_.findWhere(parameters, { id }), value]))
                .filter(([param, value]) => (param && value))
                .reduce((params, [param, value]) => ({ ...params,
                    [param.slug]: value
                }), {})
                .value();

            let search = querystring.stringify(queryParams);
            search = (search ? "?" + search : "");

            params += search;
            oldParams += window.location.search;
        }

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

        params += hash;
        oldParams += window.location.hash;

        // setting window.location.hash = "" causes the page to reload for some reasonc
        if (params !== oldParams) {
            history.replaceState(null, document.title, window.location.pathname + params);
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

    // TODO: move to action
    addParameter(parameterOption) {
        let parameters = this.props.dashboard && this.props.dashboard.parameters || [];

        let parameter = createParameter(parameterOption, parameters);

        this.setDashboardAttribute("parameters", [...parameters, parameter]);
        this.props.setEditingParameterId(parameter.id);
    }

    // TODO: move to action
    removeParameter(parameter) {
        let parameters = this.props.dashboard && this.props.dashboard.parameters || [];
        parameters = _.reject(parameters, (p) => p.id === parameter.id);
        this.setDashboardAttribute("parameters", parameters);
        this.props.removeParameter(parameter.id);
    }

    // TODO: move to action
    setParameterName(parameter, name) {
        let parameters = this.props.dashboard.parameters || [];
        let index = _.findIndex(parameters, (p) => p.id === parameter.id);
        if (index < 0) {
            return;
        }
        this.setDashboardAttribute("parameters", [
            ...parameters.slice(0, index),
            setParameterName(parameter, name),
            ...parameters.slice(index + 1)
        ]);
    }

    // TODO: move to action
    setParameterDefaultValue(parameter, value) {
        let parameters = this.props.dashboard.parameters || [];
        let index = _.findIndex(parameters, (p) => p.id === parameter.id);
        if (index < 0) {
            return;
        }
        this.setDashboardAttribute("parameters", [
            ...parameters.slice(0, index),
            setParameterDefaultValue(parameter, value),
            ...parameters.slice(index + 1)
        ]);
    }

    // we don't call this initially because DashCards initiate their own fetchCardData
    fetchDashboardCardData(props, options) {
        if (props.dashboard) {
            for (const dashcard of props.dashboard.ordered_cards) {
                const cards = [dashcard.card].concat(dashcard.series || []);
                for (const card of cards) {
                    props.fetchCardData(card, dashcard, options);
                }
            }
        }
    }

    async tickRefreshClock() {
        let refreshElapsed = (this.state.refreshElapsed || 0) + TICK_PERIOD;
        if (refreshElapsed >= this.state.refreshPeriod) {
            refreshElapsed = 0;

            await this.props.fetchDashboard(this.props.params.dashboardId, this.props.location.query);
            this.fetchDashboardCardData(this.props, { reload: true, clear: false });
        }
        this.setState({ refreshElapsed });
    }

    render() {
        let { dashboard, isEditing, editingParameter, parameterValues } = this.props;
        let { error, isFullscreen, isNightMode } = this.state;
        isNightMode = isNightMode && isFullscreen;

        let parameters = dashboard && dashboard.parameters && dashboard.parameters.map(parameter =>
            <ParameterWidget
                key={parameter.id}
                className="ml1"
                isEditing={isEditing}
                isFullscreen={isFullscreen}
                isNightMode={isNightMode}
                parameter={parameter}
                parameters={dashboard.parameters}
                dashboard={dashboard}
                parameterValue={parameterValues[parameter.id]}

                editingParameter={editingParameter}
                setEditingParameterId={this.props.setEditingParameterId}

                setName={(name) => this.setParameterName(parameter, name)}
                setDefaultValue={(value) => this.setParameterDefaultValue(parameter, value)}
                remove={() => this.removeParameter(parameter)}
                setValue={(value) => this.props.setParameterValue(parameter.id, value)}
            />
        );

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
                            addParameter={this.addParameter}
                            parameters={parameters}
                        />
                    </header>
                    {!isFullscreen && parameters && parameters.length > 0 &&
                        <div className="wrapper flex flex-column align-start mt1">
                            <div className="flex flex-row align-end" ref="parameters">
                                {parameters}
                            </div>
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
