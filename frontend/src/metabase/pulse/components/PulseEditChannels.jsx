/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import _ from "underscore";
import { assoc, assocIn } from "icepick";

import RecipientPicker from "./RecipientPicker.jsx";
import SchedulePicker from "./SchedulePicker.jsx";
import SetupMessage from "./SetupMessage.jsx";

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
        testPulse: PropTypes.func.isRequired
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

        if (_.contains(['schedule_type', 'schedule_day', 'schedule_hour', 'schedule_frame'], name)) {
            MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", channels[index].channel_type+":"+name, value);
        }

        channels[index] = { ...channels[index], [name]: value };

        // default to Monday when user wants a weekly schedule
        if (name === "schedule_type" && value === "weekly") {
            channels[index] = { ...channels[index], ["schedule_day"]: "mon" };
        }

        // default to First, Monday when user wants a monthly schedule
        if (name === "schedule_type" && value === "monthly") {
            channels[index] = { ...channels[index], ["schedule_frame"]: "first", ["schedule_day"]: "mon" };
        }

        // when the monthly schedule frame is the 15th, clear out the schedule_day
        if (name === "schedule_frame" && value === "mid") {
            channels[index] = { ...channels[index], ["schedule_day"]: null };
        }

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

    renderFields(channel, index, channelSpec) {
        return (
            <div>
                {channelSpec.fields.map(field =>
                    <div key={field.name} className={field.name}>
                        <span className="h4 text-bold mr1">{field.displayName}</span>
                        { field.type === "select" ?
                            <Select
                                className="h4 text-bold"
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
                        channel={channel}
                        channelSpec={channelSpec}
                        onPropertyChange={this.onChannelPropertyChange.bind(this, index)}
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
                        successText="Pulse sent"
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
