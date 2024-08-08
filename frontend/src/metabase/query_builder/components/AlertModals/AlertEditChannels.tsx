import cx from "classnames";
import { useMount } from "react-use";
import { jt, t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import PulseEditChannels from "metabase/pulse/components/PulseEditChannels";
import { getPulseFormInput } from "metabase/pulse/selectors";
import { getUser } from "metabase/selectors/user";
import type { Alert, User } from "metabase-types/api";

import { getScheduleFromChannel } from "./schedule";

type AlertEditChannelsProps = {
  onAlertChange: (alert: Alert) => void;
  alert: Alert;
  user: User;
  users: User[];
  formInput: any;
};

export const AlertEditChannels = ({
  onAlertChange,
  alert,
}: AlertEditChannelsProps) => {
  const user = useSelector(getUser);
  const formInput = useSelector(getPulseFormInput);

  const { data: users } = useListUsersQuery({});

  const dispatch = useDispatch();

  useMount(() => {
    dispatch(fetchPulseFormInput());
  });

  // Technically pulse definition is equal to alert definition
  const onSetPulse = (alert: Alert) => {
    const channel = checkNotNull(
      alert.channels.find(c => c.channel_type === "email"),
    );
    // If the pulse channel has been added, it PulseEditChannels puts the default schedule to it
    // We want to have same schedule for all channels
    const schedule = getScheduleFromChannel(channel);

    onAlertChange({
      ...alert,
      channels: alert.channels.map(alertChannel => ({
        ...alertChannel,
        ...schedule,
      })),
    });
  };

  return (
    <div className={cx(CS.mt4, CS.pt2)}>
      <h3
        className={cx(CS.textDark, CS.mb3)}
      >{jt`Where do you want to send these alerts?`}</h3>
      <div className={CS.mb2}>
        <PulseEditChannels
          pulse={alert}
          pulseId={alert.id}
          pulseIsValid={true}
          formInput={formInput}
          user={user}
          users={users}
          setPulse={onSetPulse}
          hideSchedulePicker={true}
          emailRecipientText={t`Email alerts to:`}
          invalidRecipientText={(domains: string) =>
            t`You're only allowed to email alerts to addresses ending in ${domains}`
          }
        />
      </div>
    </div>
  );
};
