import React, { Component, PropTypes } from "react";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { fetchDashboard } from "../actions";

export default class Dashboard extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = { error: null };
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        onChangeLocation: PropTypes.func.isRequired,
        onDashboardDeleted: PropTypes.func.isRequired
    };

    async componentDidMount() {
        // HACK: apply a css class to the page body so that we can ensure the bg-color is maintained
        document.body.classList.add("MB-lightBG");

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
        // HACK: remove our bg-color css applied when component mounts
        document.body.classList.remove("MB-lightBG");
    }

    render() {
        let { dashboard } = this.props;
        let { error } = this.state;
        return (
            <LoadingAndErrorWrapper className="Dashboard full-height" loading={!dashboard} error={error}>
            {() =>
                <div className="full">
                    <header className="bg-white border-bottom relative z2">
                        <DashboardHeader {...this.props} />
                    </header>
                    <div className="Dash-wrapper wrapper">
                        { dashboard.ordered_cards.length === 0 ?
                            <div className="absolute z1 top bottom left right flex flex-column layout-centered">
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
