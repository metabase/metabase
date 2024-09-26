import cx from "classnames";
import { t } from "ttag";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import CS from "metabase/css/core/index.css";
import { Icon, Switch } from "metabase/ui";
import type { Alert, EmailChannelSpec, User } from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const EmailChannelEdit = ({
  channelSpec,
  alert,
  toggleChannel,
  onChannelPropertyChange,
  users,
  user,
  invalidRecipientText,
}: {
  channelSpec: EmailChannelSpec;
  alert: Alert;
  toggleChannel: (channel: "email", index: number, value: boolean) => void;
  user: User;
  users: User[];
  onChannelPropertyChange: (index: number, name: string, value: any) => void;
  invalidRecipientText: (domains: string) => string;
}) => {
  const channelIndex = alert.channels.findIndex(
    channel => channel.channel_type === "email",
  );
  const channel = alert.channels[channelIndex];

  const handleRecipientsChange = (recipients: User[]) =>
    onChannelPropertyChange(channelIndex, "recipients", recipients);

  return (
    <li className={CS.borderRowDivider}>
      <div className={cx(CS.flex, CS.alignCenter, CS.p3, CS.borderRowDivider)}>
        <Icon className={cx(CS.mr1, CS.textLight)} name="mail" size={28} />

        <h2>{channelSpec.name}</h2>
        <Switch
          className={CS.flexAlignRight}
          checked={channel?.enabled}
          onChange={val =>
            toggleChannel("email", channelIndex, val.target.checked)
          }
        />
      </div>
      {channel?.enabled && channelSpec.configured ? (
        <ul className={cx(CS.bgLight, CS.px3)}>
          <li className={CS.py2}>
            <div>
              <div className={cx(CS.h4, CS.textBold, CS.mb1)}>
                {t`Email alerts to:`}
              </div>
              <RecipientPicker
                autoFocus={!!alert.name}
                recipients={channel.recipients}
                users={users}
                onRecipientsChange={handleRecipientsChange}
                invalidRecipientText={invalidRecipientText}
              />
            </div>
          </li>

          {/* {renderChannel(channel, channelSpec, channelIndex)} */}
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
