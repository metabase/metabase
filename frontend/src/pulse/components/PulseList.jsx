import React, { Component, PropTypes } from "react";

import PulseListItem from "./PulseListItem.jsx";

import { fetchPulses, savePulse, createPulse } from "../actions";

import _ from "underscore";

// const DEMO_PULSES = [
//     {   id: 0,
//         name: "October Growth Sprint",
//         creator: "Jack Mullis",
//         cards: ["Saves per day", "Average daily saves with users with 10+ followees"],
//         channels: [
//             { type: "email", schedule: "daily", subscribers: [] }
//         ]
//     },
//     {   id: 1,
//         name: "3 things that matter",
//         creator: "Luke Groesbeck",
//         cards: ["DAU/MAU", "Spots", "Waitlist emails"],
//         channels: [
//             { type: "email", schedule: "daily", subscribers: ["tom@metabase.com"] }
//         ],
//         subscribed: true
//     },
//     {   id: 2,
//         name: "IOS pulse",
//         creator: "Jack Mullis",
//         cards: ["Bugsnag Reports", "App Exceptions / HR", "Bugsnag - Crashes"],
//         channels: [
//             { type: "email", schedule: "hourly", subscribers: [] },
//             { type: "slack", schedule: "hourly", channel: "#ios" }
//         ]
//     }
// ];

export default class PulseList extends Component {
    constructor(props) {
        super(props);
        // this.state = {
        //     pulses: [...DEMO_PULSES]
        // };

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
