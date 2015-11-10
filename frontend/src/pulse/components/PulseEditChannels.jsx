import React, { Component, PropTypes } from "react";

import RecipientPicker from "./RecipientPicker.jsx";
import SchedulePicker from "./SchedulePicker.jsx";

import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";

export default class PulseEditChannels extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    addChannel(type) {
        let { pulse } = this.props;

        let channelSpec = this.props.channelSpecs[type];
        if (!channelSpec) {
            return;
        }

        let details = {};
        if (channelSpec.fields) {
            for (let field of channelSpec.fields) {
                if (field.required) {
                    if (field.type === "select") {
                        details[field.name] = field.options[0];
                    }
                }
            }
        }

        let channel = {
            channel_type: type,
            recipients: [],
            details: details,
            schedule_type: channelSpec.schedules[0],
            schedule_details: { day_of_week: "mon", hour_of_day: 8 }
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
            <li key={index} className="py1">
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
                <SchedulePicker
                    channel={channel}
                    channelSpec={channelSpec}
                    onPropertyChange={this.onChannelPropertyChange.bind(this, index)}
                />
            </li>
        );
    }

    renderChannelSection(channelSpec) {
        let { pulse } = this.props;
        return (
            <li key={channelSpec.type} className="py2 border-row-divider">
                <div className="flex align-center mb1">
                    <h2>{channelSpec.name}</h2>
                    <Toggle className="flex-align-right" value={pulse.channels.some(c => c.channel_type === channelSpec.type)} onChange={this.toggleChannel.bind(this, channelSpec.type)} />
                </div>
                <ul>
                    {pulse.channels.map((channel, index) =>
                        channel.channel_type === channelSpec.type &&
                            this.renderChannel(channel, index, channelSpec)
                    )}
                </ul>
            </li>
        )
    }

    render() {
        return (
            <div className="py1">
                <h2>Where should this data go?</h2>
                <ul>
                    {Object.values(this.props.channelSpecs).map(channelSpec =>
                        this.renderChannelSection(channelSpec)
                    )}
                </ul>
            </div>
        );
    }
}
