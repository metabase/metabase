import cx from "classnames";
import { useState } from "react";
import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { unsubscribeFromAlert } from "metabase/notifications/redux/alert";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { Alert } from "metabase-types/api";

import { AlertCreatorTitle } from "./AlertCreatorTitle";
import { AlertScheduleText } from "./AlertScheduleText";

type AlertListItemProps = {
  alert: Alert;
  highlight: boolean;
  onUnsubscribe: (alert: Alert) => void;
  onEdit: () => void;
};

// Used when a slack channel is present on an alert. This value is hardcoded
// to 1 because each alert can only be sent to a single slack channel. Additional channels
// would require their own alert.
const SLACK_CHANNEL_COUNT = 1;

export const AlertListItem = ({
  alert,
  highlight,
  onUnsubscribe,
  onEdit,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const dispatch = useDispatch();

  const [unsubscribingProgress, setUnsubscribingProgress] = useState<
    string | null
  >(null);

  const handleUnsubscribe = async () => {
    try {
      setUnsubscribingProgress(t`Unsubscribing...`);
      await dispatch(unsubscribeFromAlert(alert));
      onUnsubscribe(alert);
    } catch (e) {
      setUnsubscribingProgress(t`Failed to unsubscribe`);
    }
  };

  const isAdmin = user && user.is_superuser;
  const isCurrentUser = user && alert.creator.id === user.id;

  const emailChannel = alert.channels.find(c => c.channel_type === "email");
  const emailEnabled = emailChannel && emailChannel.enabled;
  const slackChannel = alert.channels.find(c => c.channel_type === "slack");
  const slackEnabled = slackChannel && slackChannel.enabled;
  const httpChannels = alert.channels.filter(c => c.channel_type === "http");

  return (
    <li
      className={cx(CS.flex, CS.p3, CS.textMedium, CS.borderBottom, {
        [CS.bgLightBlue]: highlight,
      })}
    >
      <Icon name="alert" size="20" />
      <div className={cx(CS.full, CS.ml2)}>
        <div className={cx(CS.flex, "align-top")}>
          <div>{user && <AlertCreatorTitle alert={alert} user={user} />}</div>
          <div
            className={cx(CS.mlAuto, CS.textBold, CS.textSmall)}
            style={{
              transform: `translateY(4px)`,
            }}
          >
            {(isAdmin || isCurrentUser) && (
              <a className={CS.link} onClick={onEdit}>{jt`Edit`}</a>
            )}
            {!isAdmin && !unsubscribingProgress && (
              <a
                className={cx(CS.link, CS.ml2)}
                onClick={handleUnsubscribe}
              >{jt`Unsubscribe`}</a>
            )}
            {!isAdmin && unsubscribingProgress && (
              <span> {unsubscribingProgress}</span>
            )}
          </div>
        </div>

        <ul className={cx(CS.flex, CS.mt2, CS.textSmall)}>
          <li className={cx(CS.flex, CS.alignCenter)}>
            <Icon name="clock" size="12" className={CS.mr1} />{" "}
            <AlertScheduleText
              schedule={alert.channels[0]}
              verbose={!isAdmin}
            />
          </li>
          {isAdmin && emailEnabled && emailChannel.recipients && (
            <li
              className={cx(CS.ml3, CS.flex, CS.alignCenter)}
              aria-label={t`Number of email recipients`}
            >
              <Icon name="mail" className={CS.mr1} />
              {emailChannel.recipients.length}
            </li>
          )}
          {isAdmin && slackEnabled && (
            <li
              className={cx(CS.ml3, CS.flex, CS.alignCenter)}
              aria-label={t`Number of Slack channels`}
            >
              <Icon name="slack" size={16} className={CS.mr1} />
              {SLACK_CHANNEL_COUNT}
            </li>
          )}
          {isAdmin && httpChannels.length > 0 && (
            <li
              className={cx(CS.ml3, CS.flex, CS.alignCenter)}
              aria-label={t`Number of HTTP channels`}
            >
              <Icon name="webhook" size={16} className={CS.mr1} />
              {httpChannels.length}
            </li>
          )}
        </ul>
      </div>
    </li>
  );
};
