import cx from "classnames";
import dayjs from "dayjs";
import { useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { formatNotificationSchedule } from "metabase/notifications/utils";
import { Badge, Box, Checkbox, Flex, Group, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type {
  AdminNotificationListItem,
  NotificationChannelType,
  NotificationId,
} from "metabase-types/api";

import {
  getChannelIconName,
  getChannelLabel,
  getHealthColor,
  getHealthLabel,
} from "./utils";

const COLUMN_COUNT = 9;

type Props = {
  notifications: AdminNotificationListItem[];
  error: unknown;
  isLoading: boolean;
  selectedIds: NotificationId[];
  onToggleRow: (id: NotificationId) => void;
  onToggleAll: () => void;
  onRowClick?: (id: NotificationId) => void;
};

export const NotificationsTable = ({
  notifications,
  error,
  isLoading,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowClick,
}: Props) => {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const showLoadingAndErrorWrapper = isLoading || error != null;

  const allSelected =
    notifications.length > 0 &&
    notifications.every((n) => selectedSet.has(n.id));
  const someSelected =
    !allSelected && notifications.some((n) => selectedSet.has(n.id));

  return (
    <table
      className={cx(AdminS.ContentTable, CS.mt2)}
      data-testid="notifications-admin-table"
    >
      <thead>
        <tr>
          <Box component="th" w={40}>
            <Checkbox
              aria-label={t`Select all`}
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleAll}
              disabled={notifications.length === 0}
            />
          </Box>
          <Box component="th" w={80}>{t`ID`}</Box>
          <th>{t`Card`}</th>
          <th>{t`Creator`}</th>
          <Box component="th" w={120}>{t`Recipients`}</Box>
          <th>{t`Schedule`}</th>
          <Box component="th" w={120}>{t`Channel`}</Box>
          <Box component="th" w={160}>{t`Last sent`}</Box>
          <Box component="th" w={160}>{t`Health`}</Box>
        </tr>
      </thead>

      <tbody>
        {showLoadingAndErrorWrapper && (
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper && notifications.length === 0 && (
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <Flex c="text-tertiary" justify="center">{t`No results`}</Flex>
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper &&
          notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              selected={selectedSet.has(notification.id)}
              onToggle={() => onToggleRow(notification.id)}
              onRowClick={
                onRowClick ? () => onRowClick(notification.id) : undefined
              }
            />
          ))}
      </tbody>
    </table>
  );
};

type NotificationRowProps = {
  notification: AdminNotificationListItem;
  selected: boolean;
  onToggle: () => void;
  onRowClick?: () => void;
};

const NotificationRow = ({
  notification,
  selected,
  onToggle,
  onRowClick,
}: NotificationRowProps) => {
  const isOrphanedCard = notification.health === "orphaned_card";
  const isOrphanedCreator = notification.health === "orphaned_creator";

  const handlers = useMemo(
    () => notification.handlers ?? [],
    [notification.handlers],
  );
  const subscriptions = useMemo(
    () => notification.subscriptions ?? [],
    [notification.subscriptions],
  );

  const recipientCount = handlers.reduce(
    (total, handler) => total + (handler.recipients?.length ?? 0),
    0,
  );

  const channels = useMemo(() => {
    const types = new Set<NotificationChannelType>();
    handlers.forEach((handler) => {
      types.add(handler.channel_type);
    });
    return Array.from(types);
  }, [handlers]);

  const scheduleLabels = useMemo(
    () =>
      subscriptions
        .map((subscription) => formatNotificationSchedule(subscription))
        .filter((value): value is string => Boolean(value)),
    [subscriptions],
  );

  return (
    <tr
      data-testid={`notification-row-${notification.id}`}
      onClick={onRowClick}
      style={onRowClick ? { cursor: "pointer" } : undefined}
    >
      <td onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={t`Select notification ${notification.id}`}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td>{notification.id}</td>
      <td>
        <CardCell notification={notification} isOrphaned={isOrphanedCard} />
      </td>
      <td>
        <CreatorCell
          notification={notification}
          isOrphaned={isOrphanedCreator}
        />
      </td>
      <td>{recipientCount}</td>
      <td>{scheduleLabels.length > 0 ? scheduleLabels.join(", ") : "—"}</td>
      <td>
        <Group gap="xs">
          {channels.map((channel) => (
            <Tooltip key={channel} label={getChannelLabel(channel)}>
              <Icon
                name={getChannelIconName(channel)}
                aria-label={getChannelLabel(channel)}
              />
            </Tooltip>
          ))}
        </Group>
      </td>
      <td>
        {notification.last_sent_at ? (
          <Tooltip
            label={<DateTime value={notification.last_sent_at} unit="minute" />}
          >
            <span>{dayjs(notification.last_sent_at).fromNow()}</span>
          </Tooltip>
        ) : (
          "—"
        )}
      </td>
      <td>
        <Badge color={getHealthColor(notification.health)} variant="light">
          {getHealthLabel(notification.health)}
        </Badge>
      </td>
    </tr>
  );
};

type CardCellProps = {
  notification: AdminNotificationListItem;
  isOrphaned: boolean;
};

const CardCell = ({ notification, isOrphaned }: CardCellProps) => {
  const card = notification.payload?.card;
  const cardId = notification.payload?.card_id;
  const name = card?.name ?? (cardId != null ? `#${cardId}` : t`Unknown card`);

  return (
    <Group gap="xs" onClick={(event) => event.stopPropagation()}>
      {cardId != null && !isOrphaned ? (
        <Link variant="brand" to={Urls.question({ id: cardId, name })}>
          {name}
        </Link>
      ) : (
        <span>{name}</span>
      )}
      {isOrphaned && (
        <Badge color="warning" variant="light">{t`Deleted`}</Badge>
      )}
    </Group>
  );
};

type CreatorCellProps = {
  notification: AdminNotificationListItem;
  isOrphaned: boolean;
};

const CreatorCell = ({ notification, isOrphaned }: CreatorCellProps) => {
  const creator = notification.creator;
  const name = creator?.common_name ?? creator?.email ?? t`Unknown`;

  return (
    <Group gap="xs">
      <span>{name}</span>
      {isOrphaned && (
        <Badge color="warning" variant="light">{t`Deactivated`}</Badge>
      )}
    </Group>
  );
};
