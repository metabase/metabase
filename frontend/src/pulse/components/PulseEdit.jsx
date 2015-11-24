import React, { Component, PropTypes } from "react";

import PulseEditName from "./PulseEditName.jsx";
import PulseEditCards from "./PulseEditCards.jsx";
import PulseEditChannels from "./PulseEditChannels.jsx";
import WhatsAPulse from "./WhatsAPulse.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm.jsx";

import {
    setEditingPulse,
    updateEditingPulse,
    saveEditingPulse,
    deletePulse,
    fetchCards,
    fetchUsers,
    fetchPulseFormInput
} from "../actions";

import _ from "underscore";
import cx from "classnames";
import { inflect } from "inflection";

export default class PulseEdit extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "save", "delete", "setPulse");
    }

    static propTypes = {
        pulses: PropTypes.object,
        pulseId: PropTypes.number
    };

    componentDidMount() {
        this.props.dispatch(setEditingPulse(this.props.pulseId));
        this.props.dispatch(fetchCards());
        this.props.dispatch(fetchUsers());
        this.props.dispatch(fetchPulseFormInput());

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "Start");
    }

    async save() {
        await this.props.dispatch(saveEditingPulse());

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "Complete", this.props.pulse.cards.length);

        this.props.onChangeLocation("/pulse");
    }

    async delete() {
        await this.props.dispatch(deletePulse(this.props.pulse.id));

        MetabaseAnalytics.trackEvent("PulseDelete", "Complete");

        this.props.onChangeLocation("/pulse");
    }

    setPulse(pulse) {
        this.props.dispatch(updateEditingPulse(pulse));
    }

    isValid() {
        let { pulse } = this.props;
        return pulse.name && pulse.cards.length && pulse.channels.length > 0 && pulse.channels.filter((c) => !this.channelIsValid(c)).length === 0;
    }

    channelIsValid(channel) {
        let channelSpec = this.props.formInput.channels && this.props.formInput.channels[channel.channel_type];
        if (!channelSpec) {
            return false;
        }
        switch (channel.schedule_type) {
            // these cases intentionally fall though
            case "weekly": if (channel.schedule_day == null) { return false };
            case "daily":  if (channel.schedule_hour == null) { return false };
            case "hourly": break;
            default:       return false;
        }
        if (channelSpec.recipients) {
            if (!channel.recipients || channel.recipients.length === 0) {
                return false;
            }
        }
        if (channelSpec.fields) {
            for (let field of channelSpec.fields) {
                if (field.required && (channel.details[field.name] == null || channel.details[field.name] == "")) {
                    return false;
                }
            }
        }
        return true;
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
        let { pulse } = this.props;
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
                            closeFn={() => this.refs.pulseInfo.close()}
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
                    <PulseEditChannels {...this.props} setPulse={this.setPulse} />
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
                        className={cx("Button Button--primary", { "disabled": !this.isValid() })}
                        normalText={pulse.id != null ? "Save changes" : "Create pulse"}
                        activeText="Saving…"
                        failedText="Save failed"
                        successText="Saved"
                    />
                    <a className="text-bold flex-align-right no-decoration text-brand-hover" href="/pulse">Cancel</a>
                </div>
            </div>
        );
    }
}
