import React, { Component, PropTypes } from "react";

import RecipientPicker from "./RecipientPicker.jsx";
import SchedulePicker from "./SchedulePicker.jsx";

import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import Icon from "metabase/components/Icon.jsx";

const CHANNEL_ICONS = {
    email: "mail",
    slack: "slack"
};

export default class PulseEditChannels extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
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
            recipients: [],
            details: details,
            schedule_type: channelSpec.schedules[0],
            schedule_day: "mon",
            schedule_hour: 8
        };

        this.props.setPulse({ ...pulse, channels: pulse.channels.concat(channel) });
    }

    removeChannel(index) {
        let { pulse } = this.props;
        this.props.setPulse({ ...pulse, channels: pulse.channels.filter((c,i) => i !== index) });
    }

    onChannelPropertyChange(index, name, value) {
        let { pulse } = this.props;
        let channels = [...pulse.channels];
        channels[index] = { ...channels[index], [name]: value };
        this.props.setPulse({ ...pulse, channels });
    }

    toggleChannel(type, enable) {
        if (enable) {
            this.addChannel(type)
        } else {
            let { pulse } = this.props;
            this.props.setPulse({ ...pulse, channels: pulse.channels.filter((c) => c.channel_type !== type) });
        }
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
        return (
            <li key={index} className="py2">
                { channelSpec.recipients &&
                    <div>
                        <div className="h4 text-bold mb1">To:</div>
                        <RecipientPicker
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
            </li>
        );
    }

    renderChannelSection(channelSpec) {
        let { pulse } = this.props;
        let channels = pulse.channels
            .map((c, index) => c.channel_type === channelSpec.type ? this.renderChannel(c, index, channelSpec) : null)
            .filter(e => !!e);
        return (
            <li key={channelSpec.type} className="border-row-divider">
                <div className="flex align-center p3 border-row-divider">
                    {CHANNEL_ICONS[channelSpec.type] && <Icon className="mr1 text-grey-2" name={CHANNEL_ICONS[channelSpec.type]} width={28} />}
                    <h2>{channelSpec.name}</h2>
                    <Toggle className="flex-align-right" value={pulse.channels.some(c => c.channel_type === channelSpec.type)} onChange={this.toggleChannel.bind(this, channelSpec.type)} />
                </div>
                {channels.length > 0 &&
                    <ul className="bg-grey-0 px3">{channels}</ul>
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
