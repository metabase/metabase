"use strict";

import React, { Component, PropTypes } from "react";

import Greeting from "metabase/lib/greeting";
import Modal from "metabase/components/Modal.react";

import HeaderTabs from "./HeaderTabs.react";
import Activity from "./Activity.react";
import Cards from "./Cards.react";
import RecentViews from "./RecentViews.react";
import CardFilters from "./CardFilters.react";
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
        const { selectedTab, user } = this.props;

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
                            <header style={this.styles.headerGreeting} className="flex align-center pb4">
                                <span className="float-left mr1">
                                    <Smile />
                                </span>
                                <span>{(user) ? this.state.greeting + ' ' + user.first_name : this.state.greeting}</span>
                            </header>
                            <div className="">
                                <span className="float-left UserNick bg-brand text-brand mr3">
                                    <span className="UserInitials">MB</span>
                                </span>
                                <HeaderTabs {...this.props} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative felx flex-column flex-full md-pl4">
                    <div className="HomeLayout">
                        <div className="HomeLayout-mainColumn">
                            { selectedTab === 'activity' ?
                                <Activity {...this.props} />
                            :
                                <Cards {...this.props} />
                            }
                        </div>
                    </div>
                    <div className="HomeLayout-sidebar">
                        { selectedTab === 'activity' ?
                            <RecentViews {...this.props} />
                        :
                            <CardFilters {...this.props} />
                        }
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
    selectedTab: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired
};
