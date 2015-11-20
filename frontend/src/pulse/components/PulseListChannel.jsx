import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import { savePulse } from "../actions";

import { inflect } from "inflection";
import _ from "underscore";

export default class PulseListChannel extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "subscribe", "unsubscribe");
    }

    static propTypes = {
        pulse: PropTypes.object.isRequired,
        channel: PropTypes.object.isRequired,
        channelSpec: PropTypes.object,
        user: PropTypes.object.isRequired
    };

    static defaultProps = {
        user: { id: 1 }
    };

    subscribe() {
        let { pulse, channel, user } = this.props;
        this.props.dispatch(savePulse({
            ...pulse,
            channels: pulse.channels.map(c => c !== channel ? c :
                { ...c, recipients: [...c.recipients, user]}
            )
        }));
    }

    unsubscribe() {
        let { pulse, channel, user } = this.props;
        this.props.dispatch(savePulse({
            ...pulse,
            channels: pulse.channels.map(c => c !== channel ? c :
                { ...c, recipients: c.recipients.filter(r => r.id !== user.id)}
            )
        }));
    }

    renderChannelSchedule() {
        let { channel, channelSpec } = this.props;

        let channelIcon = null;
        let channelVerb = channelSpec && channelSpec.displayName || channel.channel_type;
        let channelSchedule = channel.schedule_type;
        let channelTarget = channel.recipients && (channel.recipients.length + " " + inflect("people", channel.recipients.length));

        if (channel.channel_type === "email") {
            channelIcon = "mail";
            channelVerb = "Emailed";
        } else if (channel.channel_type === "slack") {
            channelIcon = "slack";
            channelVerb = "Slack'd";
            channelTarget = channel.details.channel;
        }

        return (
            <div className="h4 text-grey-4 flex align-center">
                { channelIcon && <Icon className="mr1" name={channelIcon} width={24} height={24}/> }
                <span>
                    {channelVerb + " "}
                    <strong>{channelSchedule}</strong>
                    {channelTarget && <span>{" to "}<strong>{channelTarget}</strong></span>}
                </span>
            </div>
        );
    }

    render() {
        let { channel, channelSpec, user } = this.props;

        let subscribable = channelSpec && channelSpec.allows_recipients;
        let subscribed = false;
        if (subscribable) {
            subscribed = _.any(channel.recipients, r => r.id === user.id);
        }

        return (
            <div className="py2 flex align-center">
                { this.renderChannelSchedule() }
                { subscribable &&
                    <div className="flex-align-right">
                        { subscribed ?
                            <button className="rounded bg-green text-white text-bold flex align-center">
                                <span className="pl2">You get this {channel.channel_type}</span>
                                <Icon className="p2 text-grey-1 text-hover-white cursor-pointer" name="close" width={12} height={12} onClick={this.unsubscribe}/>
                            </button>
                        :
                            <button className="rounded bordered bg-white text-default text-bold flex align-center cursor-pointer" onClick={this.subscribe}>
                                <Icon className="p2" name="add" width={12} height={12}/>
                                <span className="pr2">Get this {channel.channel_type}</span>
                            </button>
                        }
                    </div>
                }
            </div>
        );
    }
}
