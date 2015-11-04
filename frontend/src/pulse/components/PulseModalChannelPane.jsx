import React, { Component, PropTypes } from "react";

import Select from "metabase/components/Select.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";

const SCHEDULE_NAMES = {
    "hourly": (<span>Hour<br /></span>),
    "daily":  (<span>Day<br />(8 am every week day)</span>),
    "weekly": (<span>Week<br />(8 am on Mondays)</span>)
};

function getScheduleField(options) {
    return {
        name: "schedule",
        displayName: "Send every",
        type: "select-button",
        options: options.map(o => ({ name: SCHEDULE_NAMES[o], value: o })),
        required: true
    };
}

const CHANNELS = {
    "email": {
        displayName: "Email",
        fields: [
            {
                name: "recipients",
                displayName: "Send to",
                multi: true,
                type: "email",
                placeholder: "Enter email address these questions should be sent to",
                required: true
            },
            getScheduleField(["daily", "weekly"])
        ]
    },
    "slack": {
        displayName: "Slack",
        fields: [
            {
                name: "channel",
                displayName: "Send to",
                multi: false,
                type: "select",
                options: ["#general", "#random", "#ios"],
                required: true
            },
            getScheduleField(["hourly", "daily"])
        ]
    }
};

export default class PulseModalChannelPane extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    addChannel(type) {
        let { pulse } = this.props;
        let channel = { type: type, schedule: "daily" };
        let channels = [...pulse.channels, channel];
        this.props.setPulse({ ...pulse, channels });
    }

    removeChannel(index) {
        let { pulse } = this.props;
        let channels = [...pulse.channels];
        channels.splice(index, 1);
        this.props.setPulse({ ...pulse, channels });
    }

    onChannelPropertyChange(index, name, value) {
        let { pulse } = this.props;
        let channels = [...pulse.channels];
        channels[index] = { ...channels[index], [name]: value };
        this.props.setPulse({ ...pulse, channels });
    }

    renderField(field, channel, index) {
        switch (field.type) {
            case "email":
                return (
                    <input
                        className="input"
                        type="email"
                        multiple={true}
                        value={channel[field.name]}
                        onChange={(e) => this.onChannelPropertyChange(index, field.name, e.target.value)}
                    />
                );
            case "select":
                return (
                    <Select
                        value={channel[field.name]}
                        options={field.options}
                        optionNameFn={o => o}
                        optionValueFn={o => o}
                        onChange={(o) => this.onChannelPropertyChange(index, field.name, o)}
                    />
                );
            case "select-button":
                return (
                    <div className="Button-group flex">
                        {field.options.map(o =>
                            <a className={cx("Button flex-full", { "Button--primary": channel[field.name] === o.value })} onClick={() => this.onChannelPropertyChange(index, field.name, o.value)}>
                                {o.name}
                            </a>
                        )}
                    </div>
                )
            default:
                return "unknown field type"
        }
    }

    render() {
        let { pulse } = this.props;
        console.log("pulse", pulse);

        let indexesForChannel = {};
        for (let [index, channel] of Object.entries(pulse.channels)) {
            indexesForChannel[channel.type] = indexesForChannel[channel.type] || []
            indexesForChannel[channel.type].push(index);
        }

        let channels = [];
        Object.entries(CHANNELS).map(([type, CHANNEL]) => {
            if (indexesForChannel[type]) {
                indexesForChannel[type].map(index => {
                    let channel = pulse.channels[index];
                    channels.push(
                        <div>
                            <div className="flex align-center">
                                <CheckBox checked={true} onChange={this.removeChannel.bind(this, index)} />
                                <h3 className="ml1">{CHANNEL.displayName}</h3>
                            </div>
                            <ul className="ml3" >
                                {CHANNEL.fields.map(field =>
                                    <li className="py1" key={field.name}>
                                        <h4 className="py1">{field.displayName}</h4>
                                        <div>{this.renderField(field, channel, index)}</div>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )
                });
            } else {
                channels.push(
                    <div className="flex align-center">
                        <CheckBox checked={false} onChange={this.addChannel.bind(this, type)} />
                        <h3 className="ml1">{CHANNEL.displayName}</h3>
                    </div>
                )
            }
        });

        return (
            <div className="py4 flex flex-column align-center">
                <h3>Send via</h3>
                <ul className="mt2 bordered rounded">
                    {channels.map(channel =>
                        <li className="border-row-divider p2">{channel}</li>
                    )}
                </ul>
            </div>
        );
    }
}
