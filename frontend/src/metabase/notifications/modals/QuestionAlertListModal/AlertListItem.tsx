import cx from "classnames";
import { useState } from "react";
import { jt, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getNotificationEnabledChannelsMap } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Group, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import { AlertCreatorTitle } from "./AlertCreatorTitle";
import S from "./AlertListItem.module.css";

type AlertListItemProps = {
  alert: Notification;
  onUnsubscribe: (alert: Notification) => void;
  onDelete: () => void;
  canEdit: boolean;
  onEdit: () => void;
};

export const AlertListItem = ({
  alert,
  onUnsubscribe,
  canEdit,
  onEdit,
  onDelete,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const [showHoverActions, setShowHoverActions] = useState(false);

  const enabledChannelsMap = getNotificationEnabledChannelsMap(alert);

  const handleUnsubscribe = async () => {
    try {
      // TODO: implement
      // await dispatch(unsubscribeFromAlert(alert));
      onUnsubscribe(alert);
    } catch (e) {
      // TODO: error message
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    onDelete();
  };

  const handleMouseEnter = () => {
    setShowHoverActions(true);
  };

  const handleMouseLeave = () => {
    setShowHoverActions(false);
  };

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

      <Group spacing="0.75rem" align="center" c="text-medium">
        {enabledChannelsMap["channel/email"] && <Icon name="mail" />}
        {enabledChannelsMap["channel/slack"] && <Icon name="slack" size={16} />}
        {enabledChannelsMap["channel/http"] && (
          <Icon name="webhook" size={16} />
        )}
        {user && <AlertCreatorTitle alert={alert} user={user} />}
      </Group>

      {showHoverActions && (
        <div className={S.hoverActionButton}>
          {canEdit && (
            <Tooltip label={t`Delete this alert`}>
              <Icon name="trash" onClick={handleDelete} />
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
