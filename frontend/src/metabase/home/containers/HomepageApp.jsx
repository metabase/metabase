import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from 'c-3po'
import { push } from "react-router-redux";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal";

import Activity from "../components/Activity";
import RecentViews from "../components/RecentViews";
import Smile from '../components/Smile';
import NewUserOnboardingModal from '../components/NewUserOnboardingModal';
import NextStep from "../components/NextStep";

import * as homepageActions from "../actions";
import { getActivity, getRecentViews, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
    activity:       getActivity(state),
    recentViews:    getRecentViews(state),
    user:           getUser(state),
    showOnboarding: "new" in props.location.query
})


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

    }

    completeOnboarding() {
        this.setState({ onboarding: false });
    }

    render() {
        const { user } = this.props;

        return (
            <div className="full">
                { this.props.showOnboarding ?
                    <Modal>
                        <NewUserOnboardingModal
                            user={user}
                            onClose={() => (this.completeOnboarding())}
                        />
                    </Modal>
                : null }

                <div className="bg-white md-bg-brand text-brand md-text-white md-pl4">
                    <div className="HomepageGreeting">
                        <div className="Layout-mainColumn">
                            <header className="flex align-center p2 md-pb4">
                                <Smile />
                                <div className="h2 text-bold md-h1 md-ml2" id="Greeting">
                                    {Greeting.sayHelo(user.first_name)}
                                </div>
                            </header>
                        </div>
                    </div>
                </div>
                <div className="flex">
                    <div className="wrapper">
                        <div className="Layout-mainColumn pl2">
                          <div className="pt4 h2 text-normal ml2">{t`Activity`}</div>
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
