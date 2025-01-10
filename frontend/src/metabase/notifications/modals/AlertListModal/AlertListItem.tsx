import cx from "classnames";
import { useState } from "react";
import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  deleteAlert,
  unsubscribeFromAlert,
} from "metabase/notifications/redux/alert";
import { getUser } from "metabase/selectors/user";
import { Group, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import { AlertCreatorTitle } from "./AlertCreatorTitle";
import S from "./AlertListItem.module.css";

type AlertListItemProps = {
  alert: Notification;
  onUnsubscribe: (alert: Notification) => void;
  canEdit: boolean;
  onEdit: () => void;
};

export const AlertListItem = ({
  alert,
  onUnsubscribe,
  canEdit,
  onEdit,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const dispatch = useDispatch();

  const [showHoverActions, setShowHoverActions] = useState(false);

  const handleUnsubscribe = async () => {
    try {
      await dispatch(unsubscribeFromAlert(alert));
      onUnsubscribe(alert);
    } catch (e) {
      // TODO: error message
    }
  };

  const handleDelele = async (e: React.MouseEvent) => {
    e.stopPropagation();

    await dispatch(deleteAlert(alert.id));
  };

  const handleMouseEnter = () => {
    setShowHoverActions(true);
  };

  const handleMouseLeave = () => {
    setShowHoverActions(false);
  };

  const emailChannel = alert.channels.find(c => c.channel_type === "email");
  const emailEnabled = emailChannel && emailChannel.enabled;
  const slackChannel = alert.channels.find(c => c.channel_type === "slack");
  const slackEnabled = slackChannel && slackChannel.enabled;
  const httpChannels = alert.channels.filter(c => c.channel_type === "http");

  return (
    <Stack
      className={cx(
        S.notificationListItem,
        canEdit && S.notificationListItemEditable,
      )}
      w="100%"
      py="0.5rem"
      px="0.75rem"
      spacing="sm"
      onClick={onEdit}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div>
        <Text
          className={S.itemTitle}
          size="md"
          lineClamp={1}
          weight="bold"
        >{t`Alert`}</Text>
      </div>

      <Group spacing="md" align="center" c="text-medium">
        {emailEnabled && <Icon name="mail" />}
        {slackEnabled && <Icon name="slack" size={16} />}
        {httpChannels.length > 0 && <Icon name="webhook" size={16} />}
        {user && <AlertCreatorTitle alert={alert} user={user} />}
      </Group>

      {showHoverActions && (
        <div className={S.hoverActionButton}>
          {canEdit && (
            <Tooltip label={t`Delete this alert`}>
              <Icon name="trash" onClick={handleDelele} />
            </Tooltip>
          )}
          {!canEdit && (
            <a
              className={cx(CS.link, CS.ml2)}
              onClick={handleUnsubscribe}
            >{jt`Unsubscribe`}</a>
          )}
        </div>
      )}
    </Stack>
  );
};
