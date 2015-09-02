"use strict";

import React, { Component, PropTypes } from "react";

import Greeting from "metabase/lib/greeting";
import Icon from "metabase/components/Icon.react";

import HeaderTabs from "./HeaderTabs.react";
import Activity from "./Activity.react";
import Cards from "./Cards.react";
import RecentViews from "./RecentViews.react";
import CardFilters from "./CardFilters.react";


export default class Homepage extends Component {

    constructor(props) {
        super(props);

        this.state = {
            greeting: Greeting.simpleGreeting()
        };

        this.styles = {
            main: {
                marginRight: "346px"
            },
            mainWrapper: {
                width: "100%",
                margin: "0 auto",
                paddingLeft: "12em",
                paddingRight: "3em"
            },
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    render() {
        console.log('props=', this.props);
        const { selectedTab, user } = this.props;

        return (
            <div>
                <div className="bg-brand text-white">
                    <div style={this.styles.main}>
                        <div style={this.styles.mainWrapper}>
                            <header style={this.styles.headerGreeting} className="pb4">
                                <span className="float-left"><Icon name={'star'}></Icon></span>
                                <span className="pl1">{(user) ? this.state.greeting + ' ' + user.first_name : this.state.greeting}</span>
                            </header>
                            <div className="ml4">
                                <HeaderTabs {...this.props} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="">
                    <div style={this.styles.main}>
                        <div style={this.styles.mainWrapper}>
                            { selectedTab === 'activity' ?
                                <Activity {...this.props} />
                            :
                                <Cards {...this.props} />
                            }
                        </div>
                    </div>
                    <div className="">
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
    onChangeLocation: PropTypes.func.isRequired
};
