import React, { Component, PropTypes } from "react";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal.react";

import Activity from "./Activity.react";
import RecentViews from "./RecentViews.react";
import Smile from './Smile.react';
import NewUserOnboardingModal from './NewUserOnboardingModal.react';


export default class Homepage extends Component {

    constructor(props) {
        super(props);

        this.state = {
            greeting: Greeting.simpleGreeting(),
            onboarding: props.showOnboarding
        };

        this.styles = {
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    completeOnboarding() {
        this.setState({
            'onboarding': false
        });
    }

    render() {
        const { user } = this.props;

        return (
            <div className="flex flex-column flex-full">
                { this.state.onboarding ?
                    <Modal>
                        <NewUserOnboardingModal user={user} closeFn={() => (this.completeOnboarding())}></NewUserOnboardingModal>
                    </Modal>
                : null}

                <div className="CheckBg bg-brand text-white md-pl4">
                    <div className="HomeLayout">
                        <div className="HomeLayout-mainColumn">
                            <header style={this.styles.headerGreeting} className="flex align-center pb4 pt1">
                                <span className="float-left mr1">
                                    <Smile />
                                </span>
                                <span>{(user) ? this.state.greeting + ' ' + user.first_name : this.state.greeting}</span>
                            </header>
                        </div>
                    </div>
                </div>
                <div className="relative felx flex-column flex-full md-pl4">
                    <div className="HomeLayout">
                        <div className="HomeLayout-mainColumn">
                            <div style={{paddingLeft: "0.75rem"}} className="pt4 h2 text-normal">Activity</div>
                            <Activity {...this.props} />
                        </div>
                    </div>
                    <div className="HomeLayout-sidebar">
                        <RecentViews {...this.props} />
                    </div>
                </div>
            </div>
        );
    }
}

Homepage.propTypes = {
    dispatch: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    showOnboarding: PropTypes.bool.isRequired,
    user: PropTypes.object.isRequired
};
