import cx from "classnames";
import type { JSX } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import { NotificationChannelsPicker } from "metabase/notifications/NotificationChannelsPicker";
import { fetchPulseFormInput } from "metabase/notifications/pulse/actions";
import { getPulseFormInput } from "metabase/notifications/pulse/selectors";
import { getUser } from "metabase/selectors/user";
import type {
  Alert,
  Channel,
  ChannelApiResponse,
  User,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { getScheduleFromChannel } from "./schedule";

type AlertEditChannelsProps = {
  formInput: ChannelApiResponse | undefined | null;
  user: User | null;
  users: User[];
  alert: Alert;
  fetchPulseFormInput: () => Promise<ChannelApiResponse>;
  onAlertChange: (alert: Alert) => void;
};

const AlertEditChannelsInner = ({
  formInput,
  user,
  users,
  alert,
  fetchPulseFormInput,
  onAlertChange,
}: AlertEditChannelsProps): JSX.Element | null => {
  useMount(() => {
    fetchPulseFormInput();
  });

  const onSetPulse = (alert: Alert) => {
    // If the pulse channel has been added, it PulseEditChannels puts the default schedule to it
    // We want to have same schedule for all channels
    const schedule = getScheduleFromChannel(
      alert.channels.find(c => c.channel_type === "email") as Channel, // TODO: remove typecast
    );

    onAlertChange({
      ...alert,
      channels: alert.channels.map(channel => ({ ...channel, ...schedule })),
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div>
      <h3
        className={cx(CS.textDark, CS.mb3)}
      >{t`Where do you want to send these alerts?`}</h3>
      <div className={CS.mb2}>
        <NotificationChannelsPicker
          alert={alert}
          channels={formInput?.channels}
          user={user}
          users={users}
          onAlertChange={onSetPulse}
          emailRecipientText={t`Email alerts to:`}
          getInvalidRecipientText={domains =>
            t`You're only allowed to email alerts to addresses ending in ${domains}`
          }
        />
      </div>
    </div>
  );
};

export const AlertEditChannels = _.compose(
  Users.loadList(),
  connect(
    (state: State) => ({
      user: getUser(state),
      formInput: getPulseFormInput(state),
    }),
    {
      fetchPulseFormInput,
    },
  ),
)(AlertEditChannelsInner);
