import React, { Component, PropTypes } from "react";

import PulseEditName from "./PulseEditName.jsx";
import PulseEditCard from "./PulseEditCard.jsx";
import PulseEditChannel from "./PulseEditChannel.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";

import {
    setEditingPulse,
    updateEditingPulse,
    saveEditingPulse,
    fetchCards
} from "../actions";

import _ from "underscore";

export default class PulseEdit extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "save", "setPulse");
    }

    static propTypes = {
        pulses: PropTypes.object,
        pulseId: PropTypes.number
    };

    componentDidMount() {
        this.props.dispatch(setEditingPulse(this.props.pulseId));
        this.props.dispatch(fetchCards());
    }

    async save() {
        await this.props.dispatch(saveEditingPulse());
    }

    setPulse(pulse) {
        this.props.dispatch(updateEditingPulse(pulse));
    }

    render() {
        let { pulse } = this.props;
        return (
            <div className="wrapper">
                <div className="flex align-center border-bottom py3">
                    <h1>{pulse && pulse.id != null ? "Edit" : "New"} pulse</h1>
                    <a className="text-brand text-bold flex-align-right">What's a pulse?</a>
                </div>
                <PulseEditName {...this.props} setPulse={this.setPulse} />
                <PulseEditCard {...this.props} setPulse={this.setPulse} />
                <PulseEditChannel {...this.props} setPulse={this.setPulse} />
                <div className="flex align-center border-top py3">
                    <ActionButton
                        actionFn={this.save}
                        className="Button Button--primary"
                        normalText={pulse.id != null ? "Save pulse" : "Create pulse"}
                        activeText="Saving…"
                        failedText="Save failed"
                        successText="Saved"
                    />
                    <a className="text-bold flex-align-right" href="/pulse">Cancel</a>
                </div>
            </div>
        );
    }
}
