
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal.jsx";

import Activity from "../components/Activity.jsx";
import RecentViews from "../components/RecentViews.jsx";
import Smile from '../components/Smile.jsx';
import NewUserOnboardingModal from '../components/NewUserOnboardingModal.jsx';
import NextStep from "../components/NextStep.jsx";

import * as homepageActions from "../actions";
import { getActivity, getRecentViews, getUser } from "../selectors";

const mapStateToProps = (state, props) => {
    return {
        activity:       getActivity(state),
        recentViews:    getRecentViews(state),
        user:           getUser(state),
        showOnboarding: "new" in props.location.query
    }
}

import { push } from "react-router-redux";

const mapDispatchToProps = {
    ...homepageActions,
    onChangeLocation: push
}

@connect(mapStateToProps, mapDispatchToProps)
export default class HomepageApp extends Component {

    static propTypes = {
        onChangeLocation: PropTypes.func.isRequired,
        showOnboarding: PropTypes.bool.isRequired,
        user: PropTypes.object.isRequired,
        activity: PropTypes.array,
        recentViews: PropTypes.array,
        fetchActivity: PropTypes.func.isRequired,
        fetchRecentViews: PropTypes.func.isRequired
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            greeting: Greeting.sayHello(props.user && props.user.first_name),
            onboarding: props.showOnboarding
        };

        this.styles = {
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    completeOnboarding() {
        this.setState({ onboarding: false });
    }

    render() {
        const { user } = this.props;

        return (
            <div className="full">
                { this.state.onboarding ?
                    <Modal>
                        <NewUserOnboardingModal
                            user={user}
                            onClose={() => (this.completeOnboarding())}
                        />
                    </Modal>
                : null }

                <div className="bg-brand text-white md-pl4">
                    <div style={{marginRight: 346}}>
                        <div className="Layout-mainColumn">
                            <header style={this.styles.headerGreeting} className="flex align-center pb4 pt1">
                                <Smile />
                                <div id="Greeting" className="ml2">{this.state.greeting}</div>
                            </header>
                        </div>
                    </div>
                </div>
                <div className="flex">
                    <div className="wrapper">
                        <div className="Layout-mainColumn pl2">
                          <div className="pt4 h2 text-normal ml2">Activity</div>
                          <Activity {...this.props} />
                        </div>
                    </div>
                    <div className="Layout-sidebar flex-no-shrink hide sm-show">
                        <div>
                            <NextStep />
                            <RecentViews {...this.props} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
