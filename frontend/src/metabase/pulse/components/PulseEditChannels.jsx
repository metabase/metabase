/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";
import { assoc, assocIn } from "icepick";

import RecipientPicker from "./RecipientPicker.jsx";
import SetupMessage from "./SetupMessage.jsx";

import SchedulePicker from "metabase/components/SchedulePicker.jsx";
import ActionButton from "metabase/components/ActionButton.jsx";
import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import Icon from "metabase/components/Icon.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

import { channelIsValid } from "metabase/lib/pulse";

import cx from "classnames";

const CHANNEL_ICONS = {
    email: "mail",
    slack: "slack"
};

const CHANNEL_NOUN_PLURAL = {
    "email": "Emails",
    "slack": "Slack messages"
};

export default class PulseEditChannels extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {
        pulse: PropTypes.object.isRequired,
        pulseId: PropTypes.number,
        pulseIsValid: PropTypes.bool.isRequired,
        formInput: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        userList: PropTypes.array.isRequired,
        setPulse: PropTypes.func.isRequired,
        testPulse: PropTypes.func.isRequired,
        cardPreviews: PropTypes.array
    };
    static defaultProps = {};

    addChannel(type) {
        let { pulse, formInput } = this.props;

        let channelSpec = formInput.channels[type];
        if (!channelSpec) {
            return;
        }

        let details = {};
        // if (channelSpec.fields) {
        //     for (let field of channelSpec.fields) {
        //         if (field.required) {
        //             if (field.type === "select") {
        //                 details[field.name] = field.options[0];
        //             }
        //         }
        //     }
        // }

        let channel = {
            channel_type: type,
            enabled: true,
            recipients: [],
            details: details,
            schedule_type: channelSpec.schedules[0],
            schedule_day: "mon",
            schedule_hour: 8,
            schedule_frame: "first"
        };

        this.props.setPulse({ ...pulse, channels: pulse.channels.concat(channel) });

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "AddChannel", type);
    }

    removeChannel(index) {
        let { pulse } = this.props;
        this.props.setPulse(assocIn(pulse, ["channels", index, "enabled"], false));
    }

    onChannelPropertyChange(index, name, value) {
        let { pulse } = this.props;
        let channels = [...pulse.channels];

        channels[index] = { ...channels[index], [name]: value };

        this.props.setPulse({ ...pulse, channels });
    }

    // changedProp contains the schedule property that user just changed
    // newSchedule may contain also other changed properties as some property changes reset other properties
    onChannelScheduleChange(index, newSchedule, changedProp) {
        let { pulse } = this.props;
        let channels = [...pulse.channels];

        MetabaseAnalytics.trackEvent(
            (this.props.pulseId) ? "PulseEdit" : "PulseCreate",
            channels[index].channel_type + ":" + changedProp.name,
            changedProp.value
        );

        channels[index] = { ...channels[index], ...newSchedule };
        this.props.setPulse({ ...pulse, channels });
    }

    toggleChannel(type, enable) {
        const { pulse } = this.props;
        if (enable) {
            if (pulse.channels.some(c => c.channel_type === type)) {
                this.props.setPulse(assoc(pulse, "channels", pulse.channels.map(c =>
                    c.channel_type === type ? assoc(c, "enabled", true) : c
                )));
            } else {
                this.addChannel(type)
            }
        } else {
            this.props.setPulse(assoc(pulse, "channels", pulse.channels.map(c =>
                c.channel_type === type ? assoc(c, "enabled", false) : c
            )));

            MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "RemoveChannel", type);
        }
    }

    onTestPulseChannel(channel) {
        // test a single channel
        return this.props.testPulse({ ...this.props.pulse, channels: [channel] });
    }

    willPulseSkip = () => {
        let cards = _.pluck(this.props.pulse.cards, 'id');
        let cardPreviews = this.props.cardPreviews;
        let previews = _.map(cards, function (id) { return _.find(cardPreviews, function(card){ return (id == card.id);})});
        let types = _.pluck(previews, 'pulse_card_type');
        let empty = _.isEqual( _.uniq(types), ["empty"]);
        return (empty && this.props.pulse.skip_if_empty);
    }

    renderFields(channel, index, channelSpec) {
        return (
            <div>
                {channelSpec.fields.map(field =>
                    <div key={field.name} className={field.name}>
                        <span className="h4 text-bold mr1">{field.displayName}</span>
                        { field.type === "select" ?
                            <Select
                                className="h4 text-bold bg-white"
                                value={channel.details[field.name]}
                                options={field.options}
                                optionNameFn={o => o}
                                optionValueFn={o => o}
                                onChange={(o) => this.onChannelPropertyChange(index, "details", { ...channel.details, [field.name]: o })}
                            />
                        : null }
                    </div>
                )}
            </div>
        )
    }

    renderChannel(channel, index, channelSpec) {
        let isValid = this.props.pulseIsValid && channelIsValid(channel, channelSpec);
        return (
            <li key={index} className="py2">
                { channelSpec.error &&
                    <div className="pb2 text-bold text-error">{channelSpec.error}</div>
                }
                { channelSpec.recipients &&
                    <div>
                        <div className="h4 text-bold mb1">To:</div>
                        <RecipientPicker
                            isNewPulse={this.props.pulseId === undefined}
                            recipients={channel.recipients}
                            recipientTypes={channelSpec.recipients}
                            users={this.props.userList}
                            onRecipientsChange={(recipients) => this.onChannelPropertyChange(index, "recipients", recipients)}
                        />
                    </div>
                }
                { channelSpec.fields &&
                    this.renderFields(channel, index, channelSpec)
                }
                { channelSpec.schedules &&
                    <SchedulePicker
                        schedule={_.pick(channel, "schedule_day", "schedule_frame", "schedule_hour", "schedule_type") }
                        scheduleOptions={channelSpec.schedules}
                        textBeforeSendTime={`${CHANNEL_NOUN_PLURAL[channelSpec && channelSpec.type] || "Messages"} will be sent at `}
                        onScheduleChange={this.onChannelScheduleChange.bind(this, index)}
                    />
                }
                <div className="pt2">
                    <ActionButton
                        actionFn={this.onTestPulseChannel.bind(this, channel)}
                        className={cx("Button", { disabled: !isValid })}
                        normalText={channelSpec.type === "email" ?
                            "Send email now" :
                            "Send to  " + channelSpec.name + " now"}
                        activeText="Sending…"
                        failedText="Sending failed"
                        successText={ this.willPulseSkip() ?  "Didn’t send because the pulse has no results." : "Pulse sent"}
                        forceActiveStyle={ this.willPulseSkip() }
                    />
                </div>
            </li>
        );
    }

    renderChannelSection(channelSpec) {
        let { pulse, user } = this.props;
        let channels = pulse.channels
            .map((c, i) => [c, i]).filter(([c, i]) => c.enabled && c.channel_type === channelSpec.type)
            .map(([channel, index]) => this.renderChannel(channel, index, channelSpec));
        return (
            <li key={channelSpec.type} className="border-row-divider">
                <div className="flex align-center p3 border-row-divider">
                    {CHANNEL_ICONS[channelSpec.type] && <Icon className="mr1 text-grey-2" name={CHANNEL_ICONS[channelSpec.type]} size={28} />}
                    <h2>{channelSpec.name}</h2>
                    <Toggle className="flex-align-right" value={channels.length > 0} onChange={this.toggleChannel.bind(this, channelSpec.type)} />
                </div>
                {channels.length > 0 && channelSpec.configured ?
                    <ul className="bg-grey-0 px3">{channels}</ul>
                : channels.length > 0 && !channelSpec.configured ?
                    <div className="p4 text-centered">
                        <h3>{channelSpec.name} needs to be set up by an administrator.</h3>
                        <SetupMessage user={user} channels={[channelSpec.name]} />
                    </div>
                : null
                }
            </li>
        )
    }

    render() {
        let { formInput } = this.props;
        // Default to show the default channels until full formInput is loaded
        let channels = formInput.channels || {
            email: { name: "Email", type: "email" },
            slack: { name: "Slack", type: "slack" }
        };
        return (
            <div className="py1 mb4">
                <h2 className="mb3">Where should this data go?</h2>
                <ul className="bordered rounded">
                    {Object.values(channels).map(channelSpec =>
                        this.renderChannelSection(channelSpec)
                    )}
                </ul>
            </div>
        );
    }
}
