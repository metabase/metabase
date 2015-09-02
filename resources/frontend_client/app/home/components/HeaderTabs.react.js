"use strict";

import React, { Component, PropTypes } from "react";
import cx from "classnames";

import {
    setSelectedTab
} from '../actions';


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

        // component = Tab (selected, label, action)
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
            <div className="bg-brand text-white">
                <a className={activityTab} onClick={() => this.onClickActivityTab()}>Activity</a>
                <a className={questionsTab} onClick={() => this.onClickQuestionsTab()}>Saved Questions</a>
            </div>
        );
    }
}
