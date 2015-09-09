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
                width: "auto",
                marginRight: "346px",
                borderWidth: "2px"
            },
            mainWrapper: {
                width: "100%",
                margin: "0 auto",
                paddingLeft: "12em",
                paddingRight: "3em"
            },
            sidebar: {
                width: "346px",
                backgroundColor: "#F9FBFC"
            },
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    render() {
        const { selectedTab, user } = this.props;

        return (
            <div>
                <div className="bg-brand text-white">
                    <div style={this.styles.main}>
                        <div style={this.styles.mainWrapper}>
                            <header style={this.styles.headerGreeting} className="pb4">
                                <span className="float-left mr2">
                                    <svg width="48px" height="48px" viewBox="0 0 48 48">
                                        <defs>
                                            <filter x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox" id="filter-1">
                                                <feOffset dx="0" dy="1" in="SourceAlpha" result="shadowOffsetOuter1"></feOffset>
                                                <feGaussianBlur stdDeviation="2" in="shadowOffsetOuter1" result="shadowBlurOuter1"></feGaussianBlur>
                                                <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.0982591712 0" in="shadowBlurOuter1" type="matrix" result="shadowMatrixOuter1"></feColorMatrix>
                                                <feMerge>
                                                    <feMergeNode in="shadowMatrixOuter1"></feMergeNode>
                                                    <feMergeNode in="SourceGraphic"></feMergeNode>
                                                </feMerge>
                                            </filter>
                                        </defs>
                                        <g filter="url(#filter-1)" fill="#FFFFFF">
                                            <path d="M24,43 C35.045695,43 44,34.045695 44,23 C44,11.954305 35.045695,3 24,3 C12.954305,3 4,11.954305 4,23 C4,34.045695 12.954305,43 24,43 Z M18.173913,21.0544037 C19.1344083,21.0544037 19.9130435,19.3819413 19.9130435,17.3188544 C19.9130435,15.2557674 19.1344083,13.583305 18.173913,13.583305 C17.2134178,13.583305 16.4347826,15.2557674 16.4347826,17.3188544 C16.4347826,19.3819413 17.2134178,21.0544037 18.173913,21.0544037 Z M28.9565217,21.0544037 C29.917017,21.0544037 30.6956522,19.3819413 30.6956522,17.3188544 C30.6956522,15.2557674 29.917017,13.583305 28.9565217,13.583305 C27.9960265,13.583305 27.2173913,15.2557674 27.2173913,17.3188544 C27.2173913,19.3819413 27.9960265,21.0544037 28.9565217,21.0544037 Z M24,34.5616363 C28.4700217,34.5616363 32.1182868,30.5056662 32.1182868,26.0356445 C26.4909049,26.0356446 23.3555312,26.0356445 15.9608154,26.0356445 C15.9608154,30.5056662 19.5299783,34.5616363 24,34.5616363 Z"></path>
                                        </g>
                                    </svg>
                                </span>
                                <span>{(user) ? this.state.greeting + ' ' + user.first_name : this.state.greeting}</span>
                            </header>
                            <div className="">
                                <span className="float-left text-brand"><Icon className="mr3" name={'star'} height={36} width={36}></Icon></span>
                                <HeaderTabs {...this.props} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative">
                    <div style={this.styles.main} className="border-right">
                        <div style={this.styles.mainWrapper}>
                            { selectedTab === 'activity' ?
                                <Activity {...this.props} />
                            :
                                <Cards {...this.props} />
                            }
                        </div>
                    </div>
                    <div style={this.styles.sidebar} className="absolute top right">
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
