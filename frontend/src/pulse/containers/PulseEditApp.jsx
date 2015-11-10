import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseEdit from "../components/PulseEdit.jsx";
import { editPulseSelectors } from "../selectors";

// channels can require structured "recipients" and/or any number of fields which are stored in the "details" object
const CHANNELS = {
    "email": {
        type: "email",
        name: "Email",
        recipients: ["user", "email"],
        schedules: ["daily", "weekly"]
    },
    "slack": {
        type: "slack",
        name: "Slack",
        fields: [
            {
                name: "channel",
                type: "select",
                required: true,
                options: ["#general", "#random", "#ios"],
                displayName: "Post to"
            }
        ],
        schedules: ["hourly", "daily"]
    }
};

@connect(editPulseSelectors)
export default class PulseEditApp extends Component {
    render() {
        return (
            <PulseEdit channelSpecs={CHANNELS} { ...this.props } />
        );
    }
}
