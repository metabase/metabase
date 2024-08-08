import cx from "classnames";
import { useState } from "react";
import { jt, t } from "ttag";

import { unsubscribeFromAlert } from "metabase/alert/alert";
import Modal from "metabase/components/Modal";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { UpdateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { Alert } from "metabase-types/api";

import { AlertCreatorTitle } from "./AlertCreatorTitle";
import { AlertScheduleText } from "./AlertScheduleText";
import { UnsubscribedListItem } from "./UnsubscribedListItem";

type AlertListItemProps = {
  alert: Alert;
  highlight: boolean;
  setMenuFreeze: (freeze: boolean) => void;
  closeMenu: () => void;
  onUnsubscribe: (alert: Alert) => void;
};

export const AlertListItem = ({
  alert,
  highlight,
  setMenuFreeze,
  closeMenu,
  onUnsubscribe,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const dispatch = useDispatch();

  const [unsubscribingProgress, setUnsubscribingProgress] = useState<
    string | null
  >(null);
  const [hasJustUnsubscribed, setHasJustUnsubscribed] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleUnsubscribe = async () => {
    try {
      setUnsubscribingProgress(t`Unsubscribing...`);
      await dispatch(unsubscribeFromAlert(alert));
      setHasJustUnsubscribed(true);
      onUnsubscribe(alert);
    } catch (e) {
      setUnsubscribingProgress(t`Failed to unsubscribe`);
    }
  };

  const onEdit = () => {
    setMenuFreeze(true);
    setEditing(true);
  };

  const onEndEditing = (shouldCloseMenu = false) => {
    setMenuFreeze(false);
    setEditing(false);
    if (shouldCloseMenu) {
      closeMenu();
    }
  };

  const isAdmin = user && user.is_superuser;
  const isCurrentUser = user && alert.creator.id === user.id;

  const emailChannel = alert.channels.find(c => c.channel_type === "email");
  const emailEnabled = emailChannel && emailChannel.enabled;
  const slackChannel = alert.channels.find(c => c.channel_type === "slack");
  const slackEnabled = slackChannel && slackChannel.enabled;

  if (hasJustUnsubscribed) {
    return <UnsubscribedListItem />;
  }

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
            <li className={cx(CS.ml3, CS.flex, CS.alignCenter)}>
              <Icon name="mail" className={CS.mr1} />
              {emailChannel.recipients.length}
            </li>
          )}
          {isAdmin && slackEnabled && (
            <li className={cx(CS.ml3, CS.flex, CS.alignCenter)}>
              <Icon name="slack" size={16} className={CS.mr1} />
              {(slackChannel.details &&
                slackChannel.details.channel.replace("#", "")) ||
                t`No channel`}
            </li>
          )}
        </ul>
      </div>

      {editing && (
        <Modal full onClose={onEndEditing}>
          <UpdateAlertModalContent
            alert={alert}
            onCancel={onEndEditing}
            onAlertUpdated={() => onEndEditing(true)}
          />
        </Modal>
      )}
    </li>
  );
};
