import React, { Component, PropTypes } from "react";

import PulseListItem from "./PulseListItem.jsx";

import { fetchPulses, savePulse, createPulse } from "../actions";

import _ from "underscore";

export default class PulseList extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "onSave");
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidMount() {
        this.props.dispatch(fetchPulses())
    }

    onSave(pulse) {
        if (pulse.id != null) {
            this.props.dispatch(savePulse(pulse));
        } else {
            this.props.dispatch(createPulse(pulse));
        }
    }

    render() {
        let { pulses } = this.props;
        return (
            <div className="wrapper pt3">
                <div className="flex align-center mb2">
                    <h1>Pulses</h1>
                    <a href="/pulse/create" className="Button flex-align-right">Create a pulse</a>
                </div>
                <ul>
                    {pulses && pulses.map(pulse =>
                        <li key={pulse.id}>
                            <PulseListItem
                                pulse={pulse}
                                onSave={this.onSave}
                            />
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
