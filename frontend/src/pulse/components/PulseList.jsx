import React, { Component, PropTypes } from "react";

import PulseListItem from "./PulseListItem.jsx";

import { fetchPulses, fetchPulseFormInput } from "../actions";

export default class PulseList extends Component {
    constructor(props, context) {
        super(props, context);
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidMount() {
        this.props.dispatch(fetchPulses());
        this.props.dispatch(fetchPulseFormInput());
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
                                formInput={this.props.formInput}
                                dispatch={this.props.dispatch}
                            />
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
