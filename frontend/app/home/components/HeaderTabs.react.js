"use strict";

import React, { Component, PropTypes } from "react";
import cx from "classnames";

import { setSelectedTab } from '../actions';


const ACTIVITY_TAB = 'activity';
const CARDS_TAB = 'cards';

export default class HeaderTabs extends Component {

    onClickActivityTab() {
        if (this.props.selectedTab !== ACTIVITY_TAB) {
            this.props.dispatch(setSelectedTab(ACTIVITY_TAB));
        }
    }

    onClickQuestionsTab() {
        if (this.props.selectedTab !== CARDS_TAB) {
            this.props.dispatch(setSelectedTab(CARDS_TAB));
        }
    }

    render() {
        const { selectedTab } = this.props;

        const activityTab = cx({
            'HomeTab': true,
            'inline-block': true,
            'HomeTab--active': (selectedTab === ACTIVITY_TAB),
            'text-dark': (selectedTab === ACTIVITY_TAB)
        });
        const questionsTab = cx({
            'HomeTab': true,
            'inline-block': true,
            'HomeTab--active': (selectedTab === CARDS_TAB),
            'text-dark': (selectedTab === CARDS_TAB)
        });

        return (
            <div className="text-white" style={{backgroundColor: 'transparent'}}>
                <a className={activityTab} style={{marginLeft: '10px'}} href="/">Activity</a>
                <a className={questionsTab} href="/?questions">Saved Questions</a>
            </div>
        );
    }
}

HeaderTabs.propTypes = {
    selectedTab: PropTypes.string.isRequired
}
