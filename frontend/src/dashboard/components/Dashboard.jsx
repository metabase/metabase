import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { requestFullscreen, exitFullscreen } from "metabase/lib/fullscreen";

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

        _.bindAll(this, "setRefreshPeriod", "tickRefreshClock", "setFullscreen", "setNightMode");
    }

    static propTypes = {
        isEditing: PropTypes.bool.isRequired,
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

        onChangeLocation: PropTypes.func.isRequired,
        onDashboardDeleted: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        // HACK: apply a css class to the page body so that we can ensure the bg-color is maintained
        document.body.classList.add("MB-lightBG");

        this.loadParams();

        try {
            await this.props.fetchDashboard(this.props.selectedDashboard);
            if (this.props.addCardOnLoad) {
                // we have to load our cards before we can add one
                await this.props.fetchCards();
                this.props.setEditingDashboard(true);
                this.props.addCardToDashboard({ dashId: this.props.selectedDashboard, cardId: this.props.addCardOnLoad });
            }
        } catch (error) {
            if (error.status === 404) {
                this.props.onChangeLocation("/404");
            } else {
                this.setState({ error });
            }
        }
    }

    componentDidUpdate() {
        this.updateParams();

        if (this.state.isFullscreen) {
            document.querySelector(".Nav").classList.add("hide");
        } else {
            document.querySelector(".Nav").classList.remove("hide");
        }
    }

    componentWillUnmount() {
        // HACK: remove our bg-color css applied when component mounts
        document.body.classList.remove("MB-lightBG");
        document.querySelector(".Nav").classList.remove("hide");
        this._clearRefreshInterval();
    }

    loadParams() {
        let params = querystring.parse(window.location.hash.substring(1));
        let refresh = parseInt(params.refresh);
        this.setRefreshPeriod(Number.isNaN(refresh) || refresh === 0 ? null : refresh);
        this.setNightMode("night" in params);
        this.setFullscreen("fullscreen" in params);
    }

    updateParams() {
        let params = {};
        if (this.state.refreshPeriod) {
            params.refresh = this.state.refreshPeriod;
        }
        if (this.state.isFullscreen) {
            params.fullscreen = true;
        }
        if (this.state.isNightMode) {
            params.night = true;
        }
        let hash = querystring.stringify(params).replace(/=true\b/g, "");
        // setting window.location.hash = "" causes the page to reload for some reason
        history.replaceState(null, document.title, window.location.pathname + (hash ? "#" + hash : ""));
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
        } else {
            this.setState({ refreshPeriod: null, refreshElapsed: null });
        }
    }

    setNightMode(isNightMode) {
        this.setState({ isNightMode });
    }

    setFullscreen(isFullscreen) {
        if (isFullscreen !== this.state.isFullscreen) {
            if (isFullscreen) {
                requestFullscreen();
            } else {
                exitFullscreen();
            }
            this.setState({ isFullscreen });
        }
    }

    async tickRefreshClock() {
        let refreshElapsed = (this.state.refreshElapsed || 0) + TICK_PERIOD;
        if (refreshElapsed >= this.state.refreshPeriod) {
            refreshElapsed = 0;

            await this.props.fetchDashboard(this.props.selectedDashboard);
            let cards = {};
            for (let dashcard of this.props.dashboard.ordered_cards) {
                cards[dashcard.card.id] = dashcard.card;
                for (let card of dashcard.series) {
                    cards[card.id] = card;
                }
            }
            for (let card of Object.values(cards)) {
                this.props.fetchCardData(card);
            }
        }
        this.setState({ refreshElapsed });
    }

    render() {
        let { dashboard } = this.props;
        let { error, isFullscreen, isNightMode } = this.state;
        isNightMode = isNightMode && isFullscreen;
        return (
            <LoadingAndErrorWrapper className={cx("Dashboard", { "Dashboard--fullscreen": isFullscreen, "Dashboard--night": isNightMode})} loading={!dashboard} error={error}>
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
                        />
                    </header>
                    <div className="Dash-wrapper wrapper">
                        { dashboard.ordered_cards.length === 0 ?
                            <div className="absolute z1 top bottom left right flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">This dashboard is looking empty.</div>
                                <div className="text-normal text-grey-2">Add a question to start making it useful!</div>
                            </div>
                        :
                            <DashboardGrid {...this.props} isFullscreen={this.state.isFullscreen} />
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
