'use strict';

import React, { Component } from 'react';
import moment from 'moment';

import Calendar from '../../Calendar.react';

class DateShortcuts  extends Component {
    isCurrentShortcut(shortcut) {
        return this.props.shortcut === shortcut;
    }

    shortcuts() {
        return ['Today', 'Yesterday', 'Past 7 days', 'Past 30 days'];
    }

    selectedStyles() {
        return {
            'text-purple': true
        }
    }

    render() {
        return (
            <ul className="bordered rounded">
                { this.shortcuts().map((shortcut, index) => {
                    return <li key={index} className="cursor-pointer text-bold py1 text-purple text-centered inline-block half">{shortcut}</li>
                })}
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
        const tabStyles = function (state, condition) {
            return {
                fontSize: '0.7rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: state === condition? '#fff' : '#fafafa`',
                borderBottomColor: state === condition? '#fff': '#e0e0e0',
            }
        }

        return (
            <div className="px1 pt1">
                <DateShortcuts selected="today" />
                <div>
                    <div style={{display: 'flex', justifyContent: 'center'}} className="mt1">
                        <a style={tabStyles(this.state.selected, 'last')} className="py1 px2 cursor-pointer bordered" onClick={() => this.setState({ selected: 'last' })}>Last</a>
                        <a style={tabStyles(this.state.selected, 'this')} className="py1 px2 cursor-pointer bordered" onClick={() => this.setState({ selected: 'this' })}>This</a>
                    </div>
                    <div style={{marginTop: '-1px', display: 'flex', justifyContent: 'center'}} className="border-top pt1">
                        <h4 className="mr1 cursor-pointer bordered border-hover rounded p1 inline-block">Week</h4>
                        <h4 className="mr1 cursor-pointer bordered border-hover rounded p1 inline-block">Month</h4>
                        <h4 className="cursor-pointer bordered border-hover rounded p1 inline-block">Year</h4>
                    </div>
                </div>
            </div>
        )
    }
}

export default class DatePicker extends Component {
    setDateValue(index, date) {
        this.setValue(index, date.format('YYYY-MM-DD'));
    }
    render() {
        return (
            <div>
                <div className="mx1 mt1">
                    <Calendar selected={moment()} />
                </div>
                <RelativeDates />
            </div>
        )
    }
}
