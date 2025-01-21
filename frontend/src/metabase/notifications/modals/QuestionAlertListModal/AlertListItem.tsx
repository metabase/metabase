import cx from "classnames";
import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import {
  formatNotificationSchedule,
  getNotificationEnabledChannelsMap,
} from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Flex, Group, Icon, Text } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import S from "./AlertListItem.module.css";
import { AlertListItemActionButton } from "./AlertListItemActionButton";

type AlertListItemProps = {
  alert: Notification;
  canEdit: boolean;
  onEdit: (alert: Notification) => void;
  onUnsubscribe: (alert: Notification) => void;
  onDelete: (alert: Notification) => void;
};

export const AlertListItem = ({
  alert,
  canEdit,
  onEdit,
  onUnsubscribe,
  onDelete,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const [showHoverActions, setShowHoverActions] = useState(false);

  const enabledChannelsMap = getNotificationEnabledChannelsMap(alert);
  const subscription = alert.subscriptions[0];

  const handleEdit = () => {
    onEdit(alert);
  };

  const handleUnsubscribe = (e: MouseEvent) => {
    e.stopPropagation();

    onUnsubscribe(alert);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();

    onDelete(alert);
  };

  const handleMouseEnter = () => {
    setShowHoverActions(true);
  };

  const handleMouseLeave = () => {
    setShowHoverActions(false);
  };

  return (
    <Flex
      className={cx(
        S.notificationListItem,
        canEdit && S.notificationListItemEditable,
      )}
      direction="row"
      justify="space-between"
      align="center"
      w="100%"
      py="0.5rem"
      px="0.75rem"
      onClick={handleEdit}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Box>
        <Box mb="0.5rem">
          <Text
            className={S.itemTitle}
            size="md"
            lineClamp={1}
            weight="bold"
          >{t`Alert`}</Text>
        </Box>
        <Group spacing="0.75rem" align="center" c="text-medium">
          {enabledChannelsMap["channel/email"] && <Icon name="mail" />}
          {enabledChannelsMap["channel/slack"] && (
            <Icon name="slack" size={14} />
          )}
          {enabledChannelsMap["channel/http"] && (
            <Icon name="webhook" size={16} />
          )}
          <Group spacing="0.25rem" align="center" c="text-medium">
            {subscription && (
              <span>{formatNotificationSchedule(subscription)}</span>
            )}
            {user && (
              <>
                {" · "}
                {<span>{formatCreatorMessage(alert, user?.id)}</span>}
              </>
            )}
          </Group>
        </Group>
      </Box>
      {showHoverActions && (
        <div>
          {canEdit && (
            <AlertListItemActionButton
              label={t`Delete this alert`}
              iconName="trash"
              onClick={handleDelete}
            />
          )}
          {!canEdit && (
            <AlertListItemActionButton
              label={t`Unsubscribe from this`}
              iconName="unsubscribe"
              onClick={handleUnsubscribe}
            />
          )}
        </div>
      )}
    </Flex>
  );
};
