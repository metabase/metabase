/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { assoc, assocIn } from "icepick";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";
import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { channelIsValid, createChannel } from "metabase/lib/pulse";
import SlackChannelField from "metabase/sharing/components/SlackChannelField";
import { Icon } from "metabase/ui";

import RecipientPicker from "./RecipientPicker";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const CHANNEL_NOUN_PLURAL = {
  email: t`Emails`,
  slack: t`Slack messages`,
};

export default class PulseEditChannels extends Component {
  state = {};

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    pulseIsValid: PropTypes.bool.isRequired,
    formInput: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    users: PropTypes.array.isRequired,
    setPulse: PropTypes.func.isRequired,
    testPulse: PropTypes.func,
    cardPreviews: PropTypes.object,
    hideSchedulePicker: PropTypes.bool,
    emailRecipientText: PropTypes.string,
    invalidRecipientText: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  addChannel(type) {
    const { pulse, formInput } = this.props;

    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    this.props.setPulse({ ...pulse, channels: pulse.channels.concat(channel) });

    MetabaseAnalytics.trackStructEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "AddChannel",
      type,
    );
  }

  removeChannel(index) {
    const { pulse } = this.props;
    this.props.setPulse(assocIn(pulse, ["channels", index, "enabled"], false));
  }

  onChannelPropertyChange = (index, name, value) => {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], [name]: value };

    this.props.setPulse({ ...pulse, channels });
  };

  // changedProp contains the schedule property that user just changed
  // newSchedule may contain also other changed properties as some property changes reset other properties
  onChannelScheduleChange(index, newSchedule, changedProp) {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    MetabaseAnalytics.trackStructEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      channels[index].channel_type + ":" + changedProp.name,
      changedProp.value,
    );

    channels[index] = { ...channels[index], ...newSchedule };
    this.props.setPulse({ ...pulse, channels });
  }

  toggleChannel(type, enable) {
    const { pulse } = this.props;
    if (enable) {
      if (pulse.channels.some(c => c.channel_type === type)) {
        this.props.setPulse(
          assoc(
            pulse,
            "channels",
            pulse.channels.map(c =>
              c.channel_type === type ? assoc(c, "enabled", true) : c,
            ),
          ),
        );
      } else {
        this.addChannel(type);
      }
    } else {
      const channel = pulse.channels.find(
        channel => channel.channel_type === type,
      );

      const shouldRemoveChannel =
        type === "email" && channel?.recipients?.length === 0;

      const updatedPulse = shouldRemoveChannel
        ? assoc(
            pulse,
            "channels",
            pulse.channels.filter(channel => channel.channel_type !== type),
          )
        : assoc(
            pulse,
            "channels",
            pulse.channels.map(c =>
              c.channel_type === type ? assoc(c, "enabled", false) : c,
            ),
          );

      this.props.setPulse(updatedPulse);

      MetabaseAnalytics.trackStructEvent(
        this.props.pulseId ? "PulseEdit" : "PulseCreate",
        "RemoveChannel",
        type,
      );
    }
  }

  onTestPulseChannel(channel) {
    // test a single channel
    return this.props.testPulse({ ...this.props.pulse, channels: [channel] });
  }

  willPulseSkip = () => {
    const cards = _.pluck(this.props.pulse.cards, "id");
    const cardPreviews = this.props.cardPreviews;
    const previews = _.map(cards, id => _.findWhere(cardPreviews, { id }));
    const types = _.pluck(previews, "pulse_card_type");
    const empty = _.isEqual(_.uniq(types), ["empty"]);
    return empty && this.props.pulse.skip_if_empty;
  };

  renderChannel(channel, index, channelSpec) {
    const isValid =
      this.props.pulseIsValid && channelIsValid(channel, channelSpec);

    return (
      <li key={index} className={CS.py2}>
        {channelSpec.error && (
          <div className={cx(CS.pb2, CS.textBold, CS.textError)}>
            {channelSpec.error}
          </div>
        )}
        {channelSpec.recipients && (
          <div>
            <div className={cx(CS.h4, CS.textBold, CS.mb1)}>
              {this.props.emailRecipientText || t`To:`}
            </div>
            <RecipientPicker
              isNewPulse={this.props.pulseId === undefined}
              autoFocus={!!this.props.pulse.name}
              recipients={channel.recipients}
              recipientTypes={channelSpec.recipients}
              users={this.props.users}
              onRecipientsChange={recipients =>
                this.onChannelPropertyChange(index, "recipients", recipients)
              }
              invalidRecipientText={this.props.invalidRecipientText}
            />
          </div>
        )}
        {channelSpec.type === "slack" ? (
          <SlackChannelField
            channel={channel}
            channelSpec={channelSpec}
            onChannelPropertyChange={(name, value) =>
              this.onChannelPropertyChange(index, name, value)
            }
          />
        ) : null}
        {!this.props.hideSchedulePicker && channelSpec.schedules && (
          <SchedulePicker
            schedule={_.pick(
              channel,
              "schedule_day",
              "schedule_frame",
              "schedule_hour",
              "schedule_type",
            )}
            scheduleOptions={channelSpec.schedules}
            textBeforeInterval={t`Sent`}
            textBeforeSendTime={t`${
              CHANNEL_NOUN_PLURAL[channelSpec && channelSpec.type] ||
              t`Messages`
            } will be sent at`}
            onScheduleChange={this.onChannelScheduleChange.bind(this, index)}
          />
        )}
        {this.props.testPulse && (
          <div className={CS.pt2}>
            <ActionButton
              actionFn={this.onTestPulseChannel.bind(this, channel)}
              disabled={
                !isValid ||
                /* require at least one email recipient to allow email pulse testing */
                (channelSpec.type === "email" &&
                  channel.recipients.length === 0)
              }
              normalText={
                channelSpec.type === "email"
                  ? t`Send email now`
                  : t`Send to ${channelSpec.name} now`
              }
              activeText={t`Sending…`}
              failedText={t`Sending failed`}
              successText={
                this.willPulseSkip()
                  ? t`Didn’t send because the pulse has no results.`
                  : t`Pulse sent`
              }
              forceActiveStyle={this.willPulseSkip()}
            />
          </div>
        )}
      </li>
    );
  }

  renderChannelSection(channelSpec) {
    const { pulse, user } = this.props;
    const channels = pulse.channels
      .map((c, i) => [c, i])
      .filter(([c, i]) => c.enabled && c.channel_type === channelSpec.type)
      .map(([channel, index]) =>
        this.renderChannel(channel, index, channelSpec),
      );
    return (
      <li key={channelSpec.type} className={CS.borderRowDivider}>
        <div
          className={cx(CS.flex, CS.alignCenter, CS.p3, CS.borderRowDivider)}
        >
          {CHANNEL_ICONS[channelSpec.type] && (
            <Icon
              className={cx(CS.mr1, CS.textLight)}
              name={CHANNEL_ICONS[channelSpec.type]}
              size={28}
            />
          )}
          <h2>{channelSpec.name}</h2>
          <Toggle
            className={CS.flexAlignRight}
            value={channels.length > 0}
            onChange={this.toggleChannel.bind(this, channelSpec.type)}
          />
        </div>
        {channels.length > 0 && channelSpec.configured ? (
          <ul className={cx(CS.bgLight, CS.px3)}>{channels}</ul>
        ) : channels.length > 0 && !channelSpec.configured ? (
          <div className={cx(CS.p4, CS.textCentered)}>
            <h3
              className={CS.mb2}
            >{t`${channelSpec.name} needs to be set up by an administrator.`}</h3>
            <ChannelSetupMessage user={user} channels={[channelSpec.name]} />
          </div>
        ) : null}
      </li>
    );
  }

  render() {
    const { formInput } = this.props;
    // Default to show the default channels until full formInput is loaded
    const channels = formInput.channels || {
      email: { name: t`Email`, type: "email" },
      slack: { name: t`Slack`, type: "slack" },
    };
    return (
      <ul className={cx(CS.bordered, CS.rounded, CS.bgWhite)}>
        {Object.values(channels).map(channelSpec =>
          this.renderChannelSection(channelSpec),
        )}
      </ul>
    );
  }
}
