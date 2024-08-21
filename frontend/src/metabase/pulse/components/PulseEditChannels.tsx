/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { assoc } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createChannel } from "metabase/lib/pulse";
import SlackChannelField from "metabase/sharing/components/SlackChannelField";
import { Icon, type IconName } from "metabase/ui";
import type {
  Alert,
  Channel,
  ChannelSpec,
  ChannelType,
  FormInput,
  Pulse,
  User,
} from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const CHANNEL_ICONS: Record<ChannelType, IconName> = {
  email: "mail",
  slack: "slack",
};

interface PulseEditChannelsProps {
  pulse: Pulse;
  pulseId: Alert["id"];
  pulseIsValid: boolean;
  formInput: FormInput;
  user: User;
  users: User[];
  setPulse: (value: Pulse) => void;
  hideSchedulePicker: boolean;
  emailRecipientText: string;
  invalidRecipientText: (domains: string) => string;
}

export const PulseEditChannels = ({
  pulse,
  pulseId,
  formInput,
  user,
  users,
  setPulse,
  emailRecipientText,
  invalidRecipientText,
}: PulseEditChannelsProps) => {
  const addChannel = (type: ChannelType) => {
    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    setPulse({ ...pulse, channels: pulse.channels.concat(channel) });

    MetabaseAnalytics.trackStructEvent(
      pulseId ? "PulseEdit" : "PulseCreate",
      "AddChannel",
      type,
    );
  };

  const onChannelPropertyChange = (index: number, name: string, value: any) => {
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], [name]: value };

    setPulse({ ...pulse, channels });
  };

  const toggleChannel = (type: ChannelType, enable: boolean) => {
    if (enable) {
      if (pulse.channels.some(c => c.channel_type === type)) {
        setPulse(
          assoc(
            pulse,
            "channels",
            pulse.channels.map(c =>
              c.channel_type === type ? assoc(c, "enabled", true) : c,
            ),
          ),
        );
      } else {
        addChannel(type);
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

      setPulse(updatedPulse);

      MetabaseAnalytics.trackStructEvent(
        pulseId ? "PulseEdit" : "PulseCreate",
        "RemoveChannel",
        type,
      );
    }
  };

  const renderChannel = (
    channel: Channel,
    index: number,
    channelSpec: ChannelSpec,
  ) => {
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
              {emailRecipientText || t`To:`}
            </div>
            <RecipientPicker
              autoFocus={!!pulse.name}
              recipients={channel.recipients}
              users={users}
              onRecipientsChange={(recipients: User[]) =>
                onChannelPropertyChange(index, "recipients", recipients)
              }
              invalidRecipientText={invalidRecipientText}
            />
          </div>
        )}
        {channelSpec.type === "slack" ? (
          <SlackChannelField
            channel={channel}
            channelSpec={channelSpec}
            onChannelPropertyChange={(name: string, value: any) =>
              onChannelPropertyChange(index, name, value)
            }
          />
        ) : null}
      </li>
    );
  };

  const renderChannelSection = (channelSpec: ChannelSpec) => {
    const channels = pulse.channels
      .map((c, i) => [c, i] as [Channel, number])
      .filter(([c]) => c.enabled && c.channel_type === channelSpec.type)
      .map(([channel, index]) => renderChannel(channel, index, channelSpec));
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
            onChange={val => toggleChannel(channelSpec.type, val)}
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
  };

  // Default to show the default channels until full formInput is loaded
  const channels = formInput.channels || {
    email: { name: t`Email`, type: "email" },
    slack: { name: t`Slack`, type: "slack" },
  };
  return (
    <ul className={cx(CS.bordered, CS.rounded, CS.bgWhite)}>
      {Object.values(channels).map(channelSpec =>
        renderChannelSection(channelSpec),
      )}
    </ul>
  );
};
