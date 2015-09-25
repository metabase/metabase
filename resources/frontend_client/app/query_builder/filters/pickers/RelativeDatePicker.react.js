"use strict";

import React, { Component, PropTypes } from "react";

import cx from "classnames";
import _ from "underscore";

const SHORTCUTS = [
    { name: "Today",        operator: ["=", "<", ">"], values: [["relative_datetime", "current"]]},
    { name: "Yesterday",    operator: ["=", "<", ">"], values: [["relative_datetime", -1, "day"]]},
    { name: "Past 7 days",  operator: "TIME_INTERVAL", values: [-7, "day"]},
    { name: "Past 30 days", operator: "TIME_INTERVAL", values: [-30, "day"]}
];

const RELATIVE_SHORTCUTS = {
    "This": [
        { name: "Week",  operator: "TIME_INTERVAL", values: ["current", "week"]},
        { name: "Month", operator: "TIME_INTERVAL", values: ["current", "month"]},
        { name: "Year",  operator: "TIME_INTERVAL", values: ["current", "year"]}
    ],
    "Last": [
        { name: "Week",  operator: "TIME_INTERVAL", values: ["last", "week"]},
        { name: "Month", operator: "TIME_INTERVAL", values: ["last", "month"]},
        { name: "Year",  operator: "TIME_INTERVAL", values: ["last", "year"]}
    ]
};

export default class RelativeDatePicker extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "isSelectedShortcut", "onSetShortcut");
    }

    isSelectedShortcut(shortcut) {
        let { filter } = this.props;
        return (
            (Array.isArray(shortcut.operator) ? _.contains(shortcut.operator, filter[0]): filter[0] === shortcut.operator ) &&
            _.isEqual(filter.slice(2), shortcut.values)
        );
    }

    onSetShortcut(shortcut) {
        let { filter } = this.props;
        let operator;
        if (Array.isArray(shortcut.operator)) {
            if (_.contains(shortcut.operator, filter[0])) {
                operator = filter[0];
            } else {
                operator = shortcut.operator[0];
            }
        } else {
            operator = shortcut.operator;
        }
        this.props.onFilterChange([operator, filter[1], ...shortcut.values])
    }

    render() {
        return (
            <div className="px1 pt1">
                <DateShortcuts filter={this.props.filter} isSelectedShortcut={this.isSelectedShortcut} onSetShortcut={this.onSetShortcut} />
                <RelativeDates filter={this.props.filter} isSelectedShortcut={this.isSelectedShortcut} onSetShortcut={this.onSetShortcut} />
            </div>
        );
    }
}

RelativeDatePicker.propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired
};

class DateShortcuts extends Component {
    selectedStyles() {
        return {
            'text-purple': true
        }
    }

    render() {
        const cols = 2;
        const rows = Math.ceil(SHORTCUTS.length / cols);

        function buttonStyles(index) {
            let row =  Math.floor(index / cols);
            let col = index % cols;
            return {
                margin: 0,
                borderTopLeftRadius:     col !== 0        || row !== 0        ? 0 : undefined,
                borderTopRightRadius:    col !== cols - 1 || row !== 0        ? 0 : undefined,
                borderBottomLeftRadius:  col !== 0        || row !== rows - 1 ? 0 : undefined,
                borderBottomRightRadius: col !== cols - 1 || row !== rows - 1 ? 0 : undefined,
                borderTopWidth:          row !== 0                            ? 0 : undefined,
                borderLeftWidth:         col !== 0                            ? 0 : undefined
            };
        }

        return (
            <ul>
                { SHORTCUTS.map((s, index) =>
                    <li
                        key={index}
                        style={buttonStyles(index)}
                        className={cx("Button Button-normal Button--medium text-normal mr1 mb1 inline-block half text-centered", { "Button--purple": this.props.isSelectedShortcut(s) })}
                        onClick={() => this.props.onSetShortcut(s)}
                    >
                        {s.name}
                    </li>
                )}
            </ul>
        );
    }
}

DateShortcuts.propTypes = {
    isSelectedShortcut: PropTypes.func.isRequired,
    onSetShortcut: PropTypes.func.isRequired
}

class RelativeDates extends Component {
    constructor(props) {
        super(props);
        this.state = {
            tab: this._findTabWithSelection(props) || Object.keys(RELATIVE_SHORTCUTS)[0]
        }
    }

    componentWillReceiveProps(nextProps) {
        let tab = this._findTabWithSelection(nextProps);
        if (tab && tab !== this.state.tab) {
            this.setState({ tab });
        }
    }

    _findTabWithSelection() {
        for (let tab in RELATIVE_SHORTCUTS) {
            for (let shortcut of RELATIVE_SHORTCUTS[tab]) {
                if (this.props.isSelectedShortcut(shortcut)) {
                    return tab;
                }
            }
        }
        return null;
    }

    render() {
        function tabStyles(state, condition) {
            return {
                fontSize: '0.7rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: (state === condition ? '#fff' : '#fafafa`'),
                borderBottomColor: (state === condition ? '#fff': '#e0e0e0'),
                color: (state !== condition ? '#d0d0d0' : undefined)
            }
        }

        return (
            <div>
                <div style={{display: 'flex', justifyContent: 'center'}} className="mt1">
                    { Object.keys(RELATIVE_SHORTCUTS).map(tab =>
                        <a style={tabStyles(this.state.tab, tab)} className="py1 px2 cursor-pointer bordered" onClick={() => this.setState({ tab })}>{tab}</a>
                    )}
                </div>
                <ul style={{marginTop: '-1px', display: 'flex', justifyContent: 'center'}} className="border-top pt1">
                    { RELATIVE_SHORTCUTS[this.state.tab].map((s, index) =>
                        <li
                            key={index}
                            className={cx("Button Button-normal Button--medium mr1 mb1", { "Button--purple": this.props.isSelectedShortcut(s) })}
                            onClick={() => this.props.onSetShortcut(s)}
                        >
                            {s.name}
                        </li>
                    )}
                </ul>
            </div>
        )
    }
}

RelativeDates.propTypes = {
    filter: PropTypes.array.isRequired,
    isSelectedShortcut: PropTypes.func.isRequired,
    onSetShortcut: PropTypes.func.isRequired
};
