/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { assoc, updateIn, dissocIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
// import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import { createChannel } from "metabase/lib/pulse";
import SlackChannelField from "metabase/sharing/components/SlackChannelField";
import { Switch, Icon, type IconName, Flex, Button } from "metabase/ui";
import type {
  Alert,
  Channel,
  ChannelApiResponse,
  ChannelSpec,
  ChannelType,
  Pulse,
  User,
  NotificationChannel,
} from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";
import { useListChannelsQuery } from "metabase/api/channel";
import { EmailChannelEdit } from "./EmailChannelEdit";
import { SlackChannelEdit } from "./SlackChannelEdit";
import { WebhookChannelEdit } from "./WebhookChannelEdit";
import { useTestAlertMutation } from "metabase/api";

export const CHANNEL_ICONS: Record<ChannelType, IconName> = {
  email: "mail",
  slack: "slack",
  http: "webhook",
};

interface PulseEditChannelsProps {
  pulse: Alert;
  pulseId: Alert["id"];
  pulseIsValid: boolean;
  formInput: ChannelApiResponse;
  user: User;
  users: User[];
  setPulse: (value: Alert) => void;
  hideSchedulePicker: boolean;
  emailRecipientText: string;
  invalidRecipientText: (domains: string) => string;
}

export const PulseEditChannels = ({
  pulse,
  formInput,
  user,
  users,
  setPulse,
  invalidRecipientText,
}: PulseEditChannelsProps) => {
  const { data: notificationChannels = [] } = useListChannelsQuery();

  const addChannel = (
    type: ChannelType,
    notification?: NotificationChannel,
  ) => {
    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(
      channelSpec,
      notification ? { channel_id: notification.id } : undefined,
    );

    setPulse({ ...pulse, channels: pulse.channels.concat(channel) });
  };

  const onChannelPropertyChange = (index: number, name: string, value: any) => {
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], [name]: value };

    setPulse({ ...pulse, channels });
  };

  const toggleChannel = (
    type: ChannelType,
    index: number,
    enable: boolean,
    notification?: NotificationChannel,
  ) => {
    if (enable) {
      if (!!pulse.channels[index]) {
        setPulse(
          updateIn(pulse, ["channels", index], (channel: Channel) =>
            assoc(channel, "enabled", true),
          ),
        );
      } else {
        addChannel(type, notification);
      }
    } else {
      const channel = pulse.channels[index];

      const shouldRemoveChannel =
        type === "email" && channel?.recipients?.length === 0;

      const updatedPulse = shouldRemoveChannel
        ? updateIn(pulse, ["channels"], channels =>
            channels.toSpliced(index, 1),
          )
        : updateIn(pulse, ["channels", index], (channel: Channel) =>
            assoc(channel, "enabled", false),
          );
      setPulse(updatedPulse);
    }
  };

  // const renderChannel = (
  //   channel: Channel,
  //   channelSpec: ChannelSpec,
  //   index: number,
  // ) => {
  //   return (
  //     <li key={index} className={CS.py2}>
  //       {channelSpec.error && (
  //         <div className={cx(CS.pb2, CS.textBold, CS.textError)}>
  //           {channelSpec.error}
  //         </div>
  //       )}
  //       {channelSpec.recipients && (
  //         <div>
  //           <div className={cx(CS.h4, CS.textBold, CS.mb1)}>
  //             {emailRecipientText || t`To:`}
  //           </div>
  //           <RecipientPicker
  //             autoFocus={!!pulse.name}
  //             recipients={channel.recipients}
  //             users={users}
  //             onRecipientsChange={(recipients: User[]) =>
  //               onChannelPropertyChange(index, "recipients", recipients)
  //             }
  //             invalidRecipientText={invalidRecipientText}
  //           />
  //         </div>
  //       )}
  //       {channelSpec.type === "slack" ? (
  //         <SlackChannelField
  //           channel={channel}
  //           channelSpec={channelSpec}
  //           onChannelPropertyChange={(name: string, value: any) =>
  //             onChannelPropertyChange(index, name, value)
  //           }
  //         />
  //       ) : null}
  //       {channelSpec.type === "http" ? (
  //         <Flex justify="end">
  //           <Button>Send a test</Button>
  //         </Flex>
  //       ) : null}
  //     </li>
  //   );
  // };

  // const renderChannelSection = (channelSpec: ChannelSpec) => {
  //   const channels = pulse.channels
  //     .map((c, i) => [c, i] as [Channel, number])
  //     .filter(([c]) => c.enabled && c.channel_type === channelSpec.type)
  //     .map(([channel, index]) => renderChannel(channel, channelSpec, index));
  //   return (
  //     <li key={channelSpec.type} className={CS.borderRowDivider}>
  //       <div
  //         className={cx(CS.flex, CS.alignCenter, CS.p3, CS.borderRowDivider)}
  //       >
  //         {CHANNEL_ICONS[channelSpec.type] && (
  //           <Icon
  //             className={cx(CS.mr1, CS.textLight)}
  //             name={CHANNEL_ICONS[channelSpec.type]}
  //             size={28}
  //           />
  //         )}
  //         <h2>{channelSpec.name}</h2>
  //         <Switch
  //           className={CS.flexAlignRight}
  //           checked={channels.length > 0}
  //           onChange={val =>
  //             toggleChannel(channelSpec.type, val.target.checked)
  //           }
  //         />
  //       </div>
  //       {channels.length > 0 && channelSpec.configured ? (
  //         <ul className={cx(CS.bgLight, CS.px3)}>{channels}</ul>
  //       ) : channels.length > 0 && !channelSpec.configured ? (
  //         <div className={cx(CS.p4, CS.textCentered)}>
  //           <h3
  //             className={CS.mb2}
  //           >{t`${channelSpec.name} needs to be set up by an administrator.`}</h3>
  //           <ChannelSetupMessage user={user} channels={[channelSpec.name]} />
  //         </div>
  //       ) : null}
  //     </li>
  //   );
  // };

  // Default to show the default channels until full formInput is loaded
  const channels = formInput.channels || {
    email: { name: t`Email`, type: "email" },
    slack: { name: t`Slack`, type: "slack" },
    http: { name: t`Http`, type: "http" },
  };

  return (
    <ul className={cx(CS.bordered, CS.rounded, CS.bgWhite)}>
      <EmailChannelEdit
        user={user}
        users={users}
        toggleChannel={toggleChannel}
        onChannelPropertyChange={onChannelPropertyChange}
        channelSpec={channels.email}
        alert={pulse}
        invalidRecipientText={invalidRecipientText}
      />
      <SlackChannelEdit
        user={user}
        toggleChannel={toggleChannel}
        onChannelPropertyChange={onChannelPropertyChange}
        channelSpec={channels.slack}
        alert={pulse}
      />
      {notificationChannels.map(notification => (
        <WebhookChannelEdit
          key={`webhook-${notification.id}`}
          user={user}
          toggleChannel={toggleChannel}
          channelSpec={channels.http}
          alert={pulse}
          notification={notification}
        />
      ))}
      {/* {renderChannelSection(channels.http)} */}
    </ul>
  );
};
