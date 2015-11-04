import React, { Component, PropTypes } from "react";

import PulseListItem from "./PulseListItem.jsx";
import PulseModal from "./PulseModal.jsx";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import _ from "underscore";

const DEMO_PULSES = [
    {   id: 0,
        name: "October Growth Sprint",
        creator: "Jack Mullis",
        cards: ["Saves per day", "Average daily saves with users with 10+ followees"],
        channels: [
            { type: "email", schedule: "daily", subscribers: [] }
        ]
    },
    {   id: 1,
        name: "3 things that matter",
        creator: "Luke Groesbeck",
        cards: ["DAU/MAU", "Spots", "Waitlist emails"],
        channels: [
            { type: "email", schedule: "daily", subscribers: ["tom@metabase.com"] }
        ],
        subscribed: true
    },
    {   id: 2,
        name: "IOS pulse",
        creator: "Jack Mullis",
        cards: ["Bugsnag Reports", "App Exceptions / HR", "Bugsnag - Crashes"],
        channels: [
            { type: "email", schedule: "hourly", subscribers: [] },
            { type: "slack", schedule: "hourly", channel: "#ios" }
        ]
    }
];

export default class PulseList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pulses: [...DEMO_PULSES]
        };

        _.bindAll(this, "onSave");
    }

    static propTypes = {};
    static defaultProps = {};

    onSave(pulse) {
        if (pulse.id != null) {
            let pulses = [...this.state.pulses];
            pulses[pulse.id] = pulse;
            this.setState({ pulses });
        } else {
            pulse.id = this.state.pulses.length;
            let pulses = [...this.state.pulses, pulse];
            this.setState({ pulses });
        }
    }

    render() {
        let { pulses } = this.state;
        return (
            <div className="wrapper pt3">
                <div className="flex align-center mb2">
                    <h1>Pulses</h1>
                    <ModalWithTrigger
                        ref="createPulseModal"
                        triggerClasses="Button flex-align-right"
                        triggerElement="Create a pulse"
                    >
                        <PulseModal
                            onClose={() => this.refs.createPulseModal.close()}
                            onSave={this.onSave}
                        />
                    </ModalWithTrigger>
                </div>
                <ul>
                    {pulses.map(pulse =>
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
