/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t, ngettext, msgid } from "c-3po";

import Icon from "metabase/components/Icon.jsx";

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
    user: PropTypes.object.isRequired,
    savePulse: PropTypes.func.isRequired,
  };

  subscribe() {
    let { pulse, channel, user } = this.props;
    this.props.savePulse({
      ...pulse,
      channels: pulse.channels.map(
        c =>
          c !== channel ? c : { ...c, recipients: [...c.recipients, user] },
      ),
    });
  }

  unsubscribe() {
    let { pulse, channel, user } = this.props;
    this.props.savePulse({
      ...pulse,
      channels: pulse.channels.map(
        c =>
          c !== channel
            ? c
            : { ...c, recipients: c.recipients.filter(r => r.id !== user.id) },
      ),
    });
  }

  renderChannelSchedule() {
    let { channel, channelSpec } = this.props;

    let channelIcon = null;
    let channelVerb =
      (channelSpec && channelSpec.displayName) || channel.channel_type;
    let channelSchedule = channel.schedule_type;
    let channelTarget =
      channel.recipients &&
      (n => ngettext(msgid`${n} person`, `${n} people`, n))(
        channel.recipients.length,
      );

    if (channel.channel_type === "email") {
      channelIcon = "mail";
      channelVerb = t`Emailed`;
    } else if (channel.channel_type === "slack") {
      channelIcon = "slack";
      channelVerb = t`Slack'd`;
      // Address #5799 where `details` object is missing for some reason
      channelTarget = channel.details ? channel.details.channel : t`No channel`;
    }

    return (
      <div className="h4 text-grey-4 py2 flex align-center">
        {channelIcon && <Icon className="mr1" name={channelIcon} size={24} />}
        <span>
          {channelVerb + " "}
          <strong>{channelSchedule}</strong>
          {channelTarget && (
            <span>
              {" " + t`to` + " "}
              <strong>{channelTarget}</strong>
            </span>
          )}
        </span>
      </div>
    );
  }

  render() {
    let { pulse, channel, channelSpec, user } = this.props;

    let subscribable = channelSpec && channelSpec.allows_recipients;
    let subscribed = false;
    if (subscribable) {
      subscribed = _.any(channel.recipients, r => r.id === user.id);
    }
    return (
      <div className="py2 flex align-center">
        {this.renderChannelSchedule()}
        {subscribable && (
          <div className="flex-align-right">
            {subscribed ? (
              <div className="flex align-center rounded bg-green text-white text-bold">
                <div className="pl2">{t`You get this ${
                  channel.channel_type
                }`}</div>
                <Icon
                  className="p2 text-grey-1 text-white-hover cursor-pointer"
                  name="close"
                  size={12}
                  onClick={this.unsubscribe}
                />
              </div>
            ) : !pulse.read_only ? (
              <div
                className="flex align-center rounded bordered bg-white text-default text-bold cursor-pointer"
                onClick={this.subscribe}
              >
                <Icon className="p2" name="add" size={12} />
                <div className="pr2">{t`Get this ${channel.channel_type}`}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }
}
