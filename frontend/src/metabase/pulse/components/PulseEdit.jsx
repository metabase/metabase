/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import PulseEditName from "./PulseEditName.jsx";
import PulseEditCards from "./PulseEditCards.jsx";
import PulseEditChannels from "./PulseEditChannels.jsx";
import PulseEditSkip from "./PulseEditSkip.jsx";
import WhatsAPulse from "./WhatsAPulse.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm.jsx";


import { pulseIsValid, cleanPulse } from "metabase/lib/pulse";

import _ from "underscore";
import cx from "classnames";
import { inflect } from "inflection";

export default class PulseEdit extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "save", "delete", "setPulse");
    }

    static propTypes = {
        pulse: PropTypes.object.isRequired,
        pulseId: PropTypes.number,
        formInput: PropTypes.object.isRequired,
        setEditingPulse: PropTypes.func.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchUsers: PropTypes.func.isRequired,
        fetchPulseFormInput: PropTypes.func.isRequired,
        updateEditingPulse: PropTypes.func.isRequired,
        saveEditingPulse: PropTypes.func.isRequired,
        deletePulse: PropTypes.func.isRequired,
        onChangeLocation: PropTypes.func.isRequired
    };

    componentDidMount() {
        this.props.setEditingPulse(this.props.pulseId);
        this.props.fetchCards();
        this.props.fetchUsers();
        this.props.fetchPulseFormInput();

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "Start");
    }

    async save() {
        let pulse = cleanPulse(this.props.pulse,  this.props.formInput.channels);
        await this.props.updateEditingPulse(pulse);
        await this.props.saveEditingPulse();

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "Complete", this.props.pulse.cards.length);

        this.props.onChangeLocation("/pulse");
    }

    async delete() {
        await this.props.deletePulse(this.props.pulse.id);

        MetabaseAnalytics.trackEvent("PulseDelete", "Complete");

        this.props.onChangeLocation("/pulse");
    }

    setPulse(pulse) {
        this.props.updateEditingPulse(pulse);
    }

    isValid() {
        let { pulse } = this.props;
        return pulse.name && pulse.cards.length && pulse.channels.length > 0 && pulse.channels.filter((c) => this.channelIsValid(c)).length > 0;
    }

    getConfirmItems() {
        return this.props.pulse.channels.map(c =>
            c.channel_type === "email" ?
                <span>This pulse will no longer be emailed to <strong>{c.recipients.length} {inflect("address", c.recipients.length)}</strong> <strong>{c.schedule_type}</strong>.</span>
            : c.channel_type === "slack" ?
                <span>Slack channel <strong>{c.details.channel}</strong> will no longer get this pulse <strong>{c.schedule_type}</strong>.</span>
            :
                <span>Channel <strong>{c.channel_type}</strong> will no longer receive this pulse <strong>{c.schedule_type}</strong>.</span>
        );
    }

    render() {
        let { pulse, formInput } = this.props;
        let isValid = pulseIsValid(pulse, formInput.channels);
        return (
            <div className="PulseEdit">
                <div className="PulseEdit-header flex align-center border-bottom py3">
                    <h1>{pulse && pulse.id != null ? "Edit" : "New"} pulse</h1>
                    <ModalWithTrigger
                        ref="pulseInfo"
                        className="Modal WhatsAPulseModal"
                        triggerElement="What's a Pulse?"
                        triggerClasses="text-brand text-bold flex-align-right"
                    >
                        <ModalContent
                            onClose={() => this.refs.pulseInfo.close()}
                        >
                            <div className="mx4 mb4">
                                <WhatsAPulse
                                    button={<button className="Button Button--primary" onClick={() => this.refs.pulseInfo.close()}>Got it</button>}
                                />
                            </div>
                        </ModalContent>
                    </ModalWithTrigger>
                </div>
                <div className="PulseEdit-content pt2 pb4">
                    <PulseEditName {...this.props} setPulse={this.setPulse} />
                    <PulseEditCards {...this.props} setPulse={this.setPulse} />
                    <PulseEditChannels {...this.props} setPulse={this.setPulse} pulseIsValid={isValid} />
                    <PulseEditSkip {...this.props} setPulse={this.setPulse} />
                    { pulse && pulse.id != null &&
                        <div className="DangerZone mb2 p3 rounded bordered relative">
                            <h3 className="text-error absolute top bg-white px1" style={{ marginTop: "-12px" }}>Danger Zone</h3>
                            <div className="ml1">
                                <h4 className="text-bold mb1">Delete this pulse</h4>
                                <div className="flex">
                                    <p className="h4 pr2">Stop delivery and delete this pulse. There's no undo, so be careful.</p>
                                    <ModalWithTrigger
                                        ref={"deleteModal"+pulse.id}
                                        triggerClasses="Button Button--danger flex-align-right flex-no-shrink"
                                        triggerElement="Delete this Pulse"
                                    >
                                        <DeleteModalWithConfirm
                                            objectType="pulse"
                                            objectName={pulse.name}
                                            confirmItems={this.getConfirmItems()}
                                            onClose={() => this.refs["deleteModal"+pulse.id].close()}
                                            onDelete={this.delete}
                                        />
                                    </ModalWithTrigger>
                                </div>
                            </div>
                        </div>
                    }
                </div>
                <div className="PulseEdit-footer flex align-center border-top py3">
                    <ActionButton
                        actionFn={this.save}
                        className={cx("Button Button--primary", { "disabled": !isValid })}
                        normalText={pulse.id != null ? "Save changes" : "Create pulse"}
                        activeText="Saving…"
                        failedText="Save failed"
                        successText="Saved"
                    />
                    <Link to="/pulse" className="text-bold flex-align-right no-decoration text-brand-hover">Cancel</Link>
                </div>
            </div>
        );
    }
}
