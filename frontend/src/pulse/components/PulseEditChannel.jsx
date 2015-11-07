import React, { Component, PropTypes } from "react";

import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";

import { capitalize } from "metabase/lib/formatting";

import _ from "underscore";

const CHANNELS = [
    {
        type: "email",
        name: "Email",
        recipients: ["account", "email"],
        schedules: ["daily", "weekly"]
    },
    {
        type: "slack",
        name: "Slack",
        fields: [
            {
                name: "channel",
                type: "select",
                multi: false,
                required: true,
                options: ["#general", "#random", "#ios"],
                displayName: "Post to"
            }
        ],
        schedules: ["hourly", "daily"]
    }
];

const HOUR_OPTIONS = _.times(12, (n) => (
    { name: (n === 0 ? 12 : n)+":00", value: n }
));

const AM_PM_OPTIONS = [
    { name: "AM", value: 0 },
    { name: "PM", value: 1 }
];

const DAY_OF_WEEK_OPTIONS = [
    { name: "Sunday", value: "sun" },
    { name: "Monday", value: "mon" },
    { name: "Tuesday", value: "tue" },
    { name: "Wednesday", value: "wed" },
    { name: "Thursday", value: "thu" },
    { name: "Friday", value: "fri" },
    { name: "Saturday", value: "sat" }
];

export default class PulseEditChannel extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    addChannel(type) {
        let { pulse } = this.props;

        let channelSpec = _.find(CHANNELS, (c) => c.type === type);
        if (!channelSpec) {
            return;
        }

        let channel = {
            channel_type: type,
            recipients: [],
            details: {},
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

    renderDayPicker(c, index) {
        return (
            <span className="mt1">
                <span className="mx1">on</span>
                <Select
                    value={_.find(DAY_OF_WEEK_OPTIONS, (o) => o.value === c.schedule_details.day_of_week)}
                    options={DAY_OF_WEEK_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onChannelPropertyChange(index, "schedule_details", { ...c.schedule_details, day_of_week: o }) }
                />
            </span>
        );
    }

    renderHourPicker(c, index) {
        let hourOfDay = isNaN(c.schedule_details.hour_of_day) ? 8 : c.schedule_details.hour_of_day;
        let hour = hourOfDay % 12;
        let amPm = hourOfDay >= 12 ? 1 : 0;
        return (
            <div className="mt1">
                <span className="mr1">at</span>
                <Select
                    className="mr1"
                    value={_.find(HOUR_OPTIONS, (o) => o.value === hour)}
                    options={HOUR_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onChannelPropertyChange(index, "schedule_details", { ...c.schedule_details, hour_of_day: o + amPm * 12 }) }
                />
                <Select
                    value={_.find(AM_PM_OPTIONS, (o) => o.value === amPm)}
                    options={AM_PM_OPTIONS}
                    optionNameFn={o => o.name}
                    optionValueFn={o => o.value}
                    onChange={(o) => this.onChannelPropertyChange(index, "schedule_details", { ...c.schedule_details, hour_of_day: hour + o * 12 }) }
                />
            </div>
        );
    }

    renderChannel(channel, index, channelSpec) {
        return (
            <li className="py1">
                <span className="mr1">Sent</span>
                <Select
                    value={channel.schedule_type}
                    options={channelSpec.schedules}
                    optionNameFn={o => capitalize(o)}
                    optionValueFn={o => o}
                    onChange={(o) => this.onChannelPropertyChange(index, "schedule_type", o)}
                />
                { channel.schedule_type === "weekly" &&
                    this.renderDayPicker(channel, index)
                }
                { (channel.schedule_type === "daily" || channel.schedule_type === "weekly") &&
                    this.renderHourPicker(channel, index)
                }
            </li>
        )
    }

    renderChannelSection(channelSpec) {
        let { pulse } = this.props;
        return (
            <li key={channelSpec.type} className="py2 border-row-divider">
                <div className="flex align-center">
                    <h3>{channelSpec.name}</h3>
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
                    {CHANNELS.map(channelSpec =>
                        this.renderChannelSection(channelSpec)
                    )}
                </ul>
            </div>
        );
    }
}
