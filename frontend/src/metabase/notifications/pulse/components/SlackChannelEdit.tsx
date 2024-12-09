import cx from "classnames";
import { t } from "ttag";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import CS from "metabase/css/core/index.css";
import { SlackChannelField } from "metabase/notifications/SlackChannelField";
import { Icon, Switch } from "metabase/ui";
import type { Alert, SlackChannelSpec, User } from "metabase-types/api";

export const SlackChannelEdit = ({
  channelSpec,
  alert,
  toggleChannel,
  onChannelPropertyChange,
  user,
}: {
  channelSpec: SlackChannelSpec;
  alert: Alert;
  toggleChannel: (channel: "slack", index: number, value: boolean) => void;
  user: User;
  onChannelPropertyChange: (index: number, name: string, value: any) => void;
}) => {
  const channelIndex = alert.channels.findIndex(
    channel => channel.channel_type === "slack",
  );
  const channel = alert.channels[channelIndex];

  return (
    <li className={CS.borderRowDivider}>
      <div className={cx(CS.flex, CS.alignCenter, CS.p3, CS.borderRowDivider)}>
        <Icon className={cx(CS.mr1, CS.textLight)} name="mail" size={28} />

        <h2>{channelSpec.name}</h2>
        <Switch
          className={CS.flexAlignRight}
          checked={channel?.enabled}
          onChange={val =>
            toggleChannel("slack", channelIndex, val.target.checked)
          }
        />
      </div>
      {channel?.enabled && channelSpec.configured ? (
        <ul className={cx(CS.bgLight, CS.px3)}>
          <li className={CS.py2}>
            <SlackChannelField
              channel={channel}
              channelSpec={channelSpec}
              onChannelPropertyChange={(name: string, value: any) =>
                onChannelPropertyChange(channelIndex, name, value)
              }
            />
          </li>
        </ul>
      ) : channel?.enabled && !channelSpec.configured ? (
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
