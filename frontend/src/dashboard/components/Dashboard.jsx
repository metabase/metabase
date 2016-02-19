import React, { Component, PropTypes } from "react";

import DashboardHeader from "../components/DashboardHeader.jsx";
import DashboardGrid from "../components/DashboardGrid.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

export default class Dashboard extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null
        };
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
                <div className="full" style={{ overflowX: "hidden" }}>
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
