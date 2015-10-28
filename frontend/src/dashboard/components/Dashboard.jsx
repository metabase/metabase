import React, { Component, PropTypes } from "react";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { fetchDashboard, refreshDashboard } from "../actions";

import _ from "underscore";
import cx from "classnames";

export default class Dashboard extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null,
            isFullscreen: false,
            fullscreenTimer: null
        };

        _.bindAll(this, "onFullscreen", "onExitFullscreen", "onRefresh");
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        onChangeLocation: PropTypes.func.isRequired,
        onDashboardDeleted: PropTypes.func.isRequired,
        visualizationSettingsApi: PropTypes.object.isRequired
    };

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchDashboard(this.props.selectedDashboard));
        } catch (error) {
            if (error.status === 404) {
                this.props.onChangeLocation("/404");
            } else {
                this.setState({ error });
            }
        }
    }

    componentWillUnmount() {
        this.stopAutoRefresh();
    }

    onRefresh() {
        this.props.dispatch(refreshDashboard(this.props.selectedDashboard));
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        let timer = setInterval(this.onRefresh, 5*60*1000); // 5 minutes
        this.setState({ fullscreenTimer: timer });
    }

    stopAutoRefresh() {
        if (this.state.fullscreenTimer != null) {
            clearInterval(this.state.fullscreenTimer);
            this.setState({ fullscreenTimer: null });
        }
    }

    onFullscreen() {
        var elem = React.findDOMNode(this);//.getElementsByClassName("DashboardGrid")[0];
        for (let prop of ["requestFullscreen", "webkitRequestFullscreen", "mozRequestFullScreen", "msRequestFullscreen"]) {
            if (typeof elem[prop] === "function") {
                elem[prop]();
                this.startAutoRefresh();
                this.setState({ isFullscreen: true });
                break;
            }
        }
    }

    onExitFullscreen() {
        for (let prop of ["exitFullscreen", "webkitExitFullscreen", "mozCancelFullScreen", "msExitFullscreen"]) {
            if (typeof document[prop] === "function") {
                document[prop]();
                this.stopAutoRefresh();
                this.setState({ isFullscreen: false });
                break;
            }
        }
    }

    render() {
        let { dashboard } = this.props;
        let { error } = this.state;
        return (
            <LoadingAndErrorWrapper className={cx("Dashboard flex flex-full", { "Dashboard--fullscreen": this.state.isFullscreen })} loading={!dashboard} error={error}>
            {() =>
                <div className="full flex flex-column">
                    <header className="bg-white border-bottom">
                        <DashboardHeader
                            {...this.props}
                            isFullscreen={this.state.isFullscreen}
                            onFullscreen={this.onFullscreen}
                            onExitFullscreen={this.onExitFullscreen}
                        />
                    </header>
                    <div className="Dash-wrapper wrapper flex layout-centered flex-full flex-column">
                        { dashboard.ordered_cards.length === 0 ?
                            <div className="flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">This dashboard is looking empty.</div>
                                <div className="text-normal text-grey-2">Add a question to start making it useful!</div>
                            </div>
                        :
                            <DashboardGrid {...this.props} />
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
