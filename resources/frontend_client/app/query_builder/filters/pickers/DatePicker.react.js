'use strict';

import React, { Component } from 'react';
import moment from 'moment';

import Calendar from '../../Calendar.react';

class DateShortcuts  extends Component {
    render() {
        return (
            <ul className="bordered rounded">
                <li className="cursor-pointer text-bold py1 text-purple text-centered border-bottom inline-block half">Today</li>
                <li className="cursor-pointer text-bold py1 text-centered border-left border-bottom inline-block half">Yesterday</li>
                <li className="cursor-pointer text-bold py1 text-centered inline-block half">Past 7 days</li>
                <li className="cursor-pointer text-bold py1 text-centered border-left inline-block half">Past 30 days</li>
            </ul>
        )
    }
}

class RelativeDates extends Component {
    constructor() {
        super();
        this.state = {
            selected: 'last'
        }
    }
    render() {
        return (
            <div className="px1 pt1">
                <DateShortcuts />
                <div>
                    <div>
                        <a onClick={() => this.setState({ selected: 'last' })}>Last</a>
                        <a onClick={() => this.setState({ selected: 'this' })}>This</a>
                    </div>
                    <ul className="border-top">
                        <li className="bordered rounded p1 inline-block">Week</li>
                        <li className="bordered rounded p1 inline-block">Month</li>
                        <li className="bordered rounded p1 inline-block">Year</li>
                    </ul>
                </div>
            </div>
        )
    }
}

export default class DatePicker extends Component {
    render() {
        return (
            <div>
                <div className="mx1 mt1 bordered rounded">
                    <Calendar selected={moment()} />
                </div>
                <RelativeDates />
            </div>
        )
    }
}
