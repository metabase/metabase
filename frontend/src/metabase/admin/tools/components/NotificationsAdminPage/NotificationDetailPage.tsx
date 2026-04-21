import dayjs from "dayjs";
import { useCallback, useState } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useAdminNotificationDetailQuery,
  useBulkNotificationActionMutation,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import AdminS from "metabase/css/admin.module.css";
import { formatNotificationSchedule } from "metabase/notifications/utils";
import { formatDuration } from "metabase/query_builder/components/view/ExecutionTime/utils";
import { addUndo } from "metabase/redux/undo";
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type {
  AdminNotificationDetail,
  NotificationHandler,
  NotificationRecipient,
  NotificationSendHistoryEntry,
} from "metabase-types/api";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "../../../components/SettingsSection";

import { ChangeOwnerModal } from "./ChangeOwnerModal";
import {
  getChannelIconName,
  getChannelLabel,
  getHealthColor,
  getHealthLabel,
} from "./utils";

type RouteParams = {
  notificationId: string;
};

export const NotificationDetailPage = ({
  params,
}: WithRouterProps<RouteParams>) => {
  const notificationId = Number(params.notificationId);
  const dispatch = useDispatch();
  const [isChangeOwnerOpen, setIsChangeOwnerOpen] = useState(false);

  const { modalContent: confirmContent, show: showConfirm } = useConfirmation();

  const {
    data: notification,
    error,
    isLoading,
  } = useAdminNotificationDetailQuery(notificationId);

  const [bulkAction, { isLoading: isBulkLoading }] =
    useBulkNotificationActionMutation();

  const goBack = useCallback(() => {
    dispatch(push(Urls.adminToolsNotifications()));
  }, [dispatch]);

  const handleArchive = useCallback(() => {
    if (!notification) {
      return;
    }
    showConfirm({
      title: t`Archive this alert?`,
      message: t`Recipients will stop receiving this alert.`,
      confirmButtonText: t`Archive`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        try {
          await bulkAction({
            notification_ids: [notification.id],
            action: "archive",
          }).unwrap();
          dispatch(addUndo({ message: t`Archived alert` }));
        } catch {
          dispatch(
            addUndo({
              icon: "warning",
              message: t`Could not archive alert.`,
            }),
          );
        }
      },
    });
  }, [bulkAction, dispatch, notification, showConfirm]);

  const handleUnarchive = useCallback(() => {
    if (!notification) {
      return;
    }
    showConfirm({
      title: t`Unarchive this alert?`,
      message: t`Recipients will begin receiving this alert again on the next scheduled run.`,
      confirmButtonText: t`Unarchive`,
      onConfirm: async () => {
        try {
          await bulkAction({
            notification_ids: [notification.id],
            action: "unarchive",
          }).unwrap();
          dispatch(addUndo({ message: t`Unarchived alert` }));
        } catch {
          dispatch(
            addUndo({
              icon: "warning",
              message: t`Could not unarchive alert.`,
            }),
          );
        }
      },
    });
  }, [bulkAction, dispatch, notification, showConfirm]);

  const handleChangeOwnerConfirm = useCallback(
    async (ownerId: number) => {
      if (!notification) {
        return;
      }
      try {
        await bulkAction({
          notification_ids: [notification.id],
          action: "change-owner",
          owner_id: ownerId,
        }).unwrap();
        dispatch(addUndo({ message: t`Changed owner` }));
        setIsChangeOwnerOpen(false);
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not change owner.`,
          }),
        );
      }
    },
    [bulkAction, dispatch, notification],
  );

  if (isLoading || error || !notification) {
    return (
      <SettingsPageWrapper>
        <SettingsSection>
          <BackLink onClick={goBack} />
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        </SettingsSection>
      </SettingsPageWrapper>
    );
  }

  const handlers = notification.handlers ?? [];
  const isOrphanedCard = notification.health === "orphaned_card";
  const isOrphanedCreator = notification.health === "orphaned_creator";

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <BackLink onClick={goBack} />

        <DetailHeader
          notification={notification}
          isOrphanedCard={isOrphanedCard}
          isBulkLoading={isBulkLoading}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onChangeOwner={() => setIsChangeOwnerOpen(true)}
        />

        <Divider />

        <InfoSection
          notification={notification}
          isOrphanedCreator={isOrphanedCreator}
          onChangeOwner={() => setIsChangeOwnerOpen(true)}
        />

        <Divider />

        <RecipientsSection handlers={handlers} />

        <Divider />

        <SendHistorySection history={notification.send_history ?? []} />

        <ChangeOwnerModal
          opened={isChangeOwnerOpen}
          count={1}
          isSubmitting={isBulkLoading}
          onClose={() => setIsChangeOwnerOpen(false)}
          onConfirm={handleChangeOwnerConfirm}
        />

        {confirmContent}
      </SettingsSection>
    </SettingsPageWrapper>
  );
};

const BackLink = ({ onClick }: { onClick: () => void }) => (
  <Group gap="xs">
    <Button
      variant="subtle"
      size="compact-sm"
      leftSection={<Icon name="chevronleft" size={12} />}
      onClick={onClick}
    >
      {t`Back to notifications`}
    </Button>
  </Group>
);

type DetailHeaderProps = {
  notification: AdminNotificationDetail;
  isOrphanedCard: boolean;
  isBulkLoading: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onChangeOwner: () => void;
};

const DetailHeader = ({
  notification,
  isOrphanedCard,
  isBulkLoading,
  onArchive,
  onUnarchive,
  onChangeOwner,
}: DetailHeaderProps) => {
  const cardId = notification.payload?.card_id;
  const cardName =
    notification.payload?.card?.name ??
    (cardId != null ? `#${cardId}` : t`Unknown card`);

  return (
    <Flex justify="space-between" align="flex-start" gap="md" wrap="wrap">
      <Stack gap="xs">
        <Group gap="sm" align="center">
          <Title order={2}>{t`Notification #${notification.id}`}</Title>
          <Badge variant="light">{t`Alert`}</Badge>
          <Badge color={getHealthColor(notification.health)} variant="light">
            {getHealthLabel(notification.health)}
          </Badge>
        </Group>

        <Group gap="xs">
          <Text c="text-secondary">{t`Target:`}</Text>
          {cardId != null && !isOrphanedCard ? (
            <Link
              variant="brand"
              to={Urls.question({ id: cardId, name: cardName })}
            >
              {cardName}
            </Link>
          ) : (
            <Text>{cardName}</Text>
          )}
          {isOrphanedCard && (
            <Badge color="error" variant="light">{t`Deleted`}</Badge>
          )}
        </Group>
      </Stack>

      <Group gap="sm">
        {notification.active ? (
          <Button
            variant="outline"
            color="danger"
            disabled={isBulkLoading}
            onClick={onArchive}
          >
            {t`Archive`}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={isBulkLoading}
            onClick={onUnarchive}
          >
            {t`Unarchive`}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={isBulkLoading}
          onClick={onChangeOwner}
        >
          {t`Change owner`}
        </Button>
      </Group>
    </Flex>
  );
};

type InfoSectionProps = {
  notification: AdminNotificationDetail;
  isOrphanedCreator: boolean;
  onChangeOwner: () => void;
};

const InfoSection = ({
  notification,
  isOrphanedCreator,
  onChangeOwner,
}: InfoSectionProps) => {
  const creator = notification.creator;
  const handlers = notification.handlers ?? [];
  const subscriptions = notification.subscriptions ?? [];

  return (
    <Stack gap="sm">
      <Title order={4}>{t`Details`}</Title>

      <InfoRow label={t`Creator`}>
        <Group gap="xs">
          {creator ? (
            <>
              <Text>{creator.common_name ?? creator.email ?? t`Unknown`}</Text>
              {creator.email && (
                <Text c="text-secondary">{`<${creator.email}>`}</Text>
              )}
            </>
          ) : (
            <Text c="text-secondary">{t`Unknown`}</Text>
          )}
          {isOrphanedCreator && (
            <Badge color="warning" variant="light">{t`Deactivated`}</Badge>
          )}
          <Button variant="subtle" size="compact-sm" onClick={onChangeOwner}>
            {t`Change owner`}
          </Button>
        </Group>
      </InfoRow>

      <InfoRow label={t`Schedule`}>
        {subscriptions.length > 0 ? (
          <Stack gap={2}>
            {subscriptions.map((subscription) => (
              <ScheduleLine
                key={subscription.id ?? subscription.cron_schedule}
                subscription={subscription}
              />
            ))}
          </Stack>
        ) : (
          <Text c="text-secondary">{t`No schedule`}</Text>
        )}
      </InfoRow>

      <InfoRow label={t`Channels`}>
        {handlers.length > 0 ? (
          <Stack gap={4}>
            {handlers.map((handler, index) => (
              <ChannelLine key={handler.id ?? index} handler={handler} />
            ))}
          </Stack>
        ) : (
          <Text c="text-secondary">{t`No channels`}</Text>
        )}
      </InfoRow>

      <InfoRow label={t`Created`}>
        {notification.created_at ? (
          <DateTime value={notification.created_at} unit="minute" />
        ) : (
          <Text c="text-secondary">{t`Unknown`}</Text>
        )}
      </InfoRow>

      <InfoRow label={t`Last sent`}>
        {notification.last_sent_at ? (
          <Tooltip
            label={<DateTime value={notification.last_sent_at} unit="minute" />}
          >
            <span>{dayjs(notification.last_sent_at).fromNow()}</span>
          </Tooltip>
        ) : (
          <Text c="text-secondary">{t`Never`}</Text>
        )}
      </InfoRow>
    </Stack>
  );
};

const InfoRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Flex gap="md" align="flex-start">
    <Box w={140} style={{ flexShrink: 0 }}>
      <Text c="text-secondary">{label}</Text>
    </Box>
    <Box style={{ flex: 1 }}>{children}</Box>
  </Flex>
);

const ScheduleLine = ({
  subscription,
}: {
  subscription: AdminNotificationDetail["subscriptions"][number];
}) => {
  const formatted = formatNotificationSchedule(subscription);
  return <Text>{formatted ?? subscription.cron_schedule}</Text>;
};

const ChannelLine = ({ handler }: { handler: NotificationHandler }) => {
  const label = getChannelLabel(handler.channel_type);
  const iconName = getChannelIconName(handler.channel_type);
  return (
    <Group gap="xs">
      <Icon name={iconName} aria-label={label} />
      <Text>{label}</Text>
      <ChannelDetail handler={handler} />
    </Group>
  );
};

const ChannelDetail = ({ handler }: { handler: NotificationHandler }) => {
  if (handler.channel_type === "channel/slack") {
    const channelNames = handler.recipients
      ?.map((r) => r.details?.value)
      .filter(Boolean);
    return channelNames && channelNames.length > 0 ? (
      <Text c="text-secondary">{channelNames.join(", ")}</Text>
    ) : null;
  }
  if (handler.channel_type === "channel/email") {
    const count = handler.recipients?.length ?? 0;
    return (
      <Text c="text-secondary">
        {count === 1 ? t`1 recipient` : t`${count} recipients`}
      </Text>
    );
  }
  if (handler.channel_type === "channel/http") {
    const channelDetailsName =
      handler.channel?.details?.name ?? handler.channel?.details?.url;
    return channelDetailsName ? (
      <Text c="text-secondary">{String(channelDetailsName)}</Text>
    ) : null;
  }
  return null;
};

const RecipientsSection = ({
  handlers,
}: {
  handlers: NotificationHandler[];
}) => {
  const recipients = handlers.flatMap((handler) =>
    (handler.recipients ?? []).map((r) => ({
      handler,
      recipient: r,
    })),
  );

  return (
    <Stack gap="sm">
      <Title order={4}>{t`Recipients`}</Title>
      {recipients.length === 0 ? (
        <Text c="text-secondary">{t`No recipients`}</Text>
      ) : (
        <table className={AdminS.ContentTable}>
          <thead>
            <tr>
              <th>{t`Name`}</th>
              <th>{t`Email / channel`}</th>
              <th>{t`Status`}</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map(({ handler, recipient }, index) => (
              <RecipientRow
                key={`${handler.id ?? "handler"}-${recipient.id ?? index}`}
                recipient={recipient}
              />
            ))}
          </tbody>
        </table>
      )}
    </Stack>
  );
};

const RecipientRow = ({ recipient }: { recipient: NotificationRecipient }) => {
  if (recipient.type === "notification-recipient/user") {
    const user = recipient.user;
    // `recipients-detail` hydration drops deactivated users (sets :user nil on
    // the recipient), so a missing user here means the underlying user is
    // deactivated or has been deleted.
    const isActive = user != null;
    const name = user?.common_name ?? user?.email ?? t`Deactivated user`;
    return (
      <tr>
        <td>{name}</td>
        <td>{user?.email ?? "—"}</td>
        <td>
          {isActive ? (
            <Badge color="success" variant="light">{t`Active`}</Badge>
          ) : (
            <Badge color="warning" variant="light">{t`Deactivated`}</Badge>
          )}
        </td>
      </tr>
    );
  }
  if (recipient.type === "notification-recipient/raw-value") {
    return (
      <tr>
        <td>—</td>
        <td>{recipient.details?.value ?? "—"}</td>
        <td>
          <Badge variant="light">{t`External`}</Badge>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{t`Group`}</td>
      <td>—</td>
      <td>
        <Badge variant="light">{t`Group`}</Badge>
      </td>
    </tr>
  );
};

const SendHistorySection = ({
  history,
}: {
  history: NotificationSendHistoryEntry[];
}) => (
  <Stack gap="sm">
    <Title order={4}>{t`Send history`}</Title>
    {history.length === 0 ? (
      <Text c="text-secondary">{t`No send history available`}</Text>
    ) : (
      <table className={AdminS.ContentTable}>
        <thead>
          <tr>
            <th>{t`Timestamp`}</th>
            <th>{t`Status`}</th>
            <th>{t`Duration`}</th>
            <th>{t`Error`}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, index) => (
            <SendHistoryRow key={index} entry={entry} />
          ))}
        </tbody>
      </table>
    )}
  </Stack>
);

const SendHistoryRow = ({ entry }: { entry: NotificationSendHistoryEntry }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <tr>
      <td>
        {entry.timestamp ? (
          <Tooltip label={<DateTime value={entry.timestamp} unit="minute" />}>
            <span>{dayjs(entry.timestamp).fromNow()}</span>
          </Tooltip>
        ) : (
          "—"
        )}
      </td>
      <td>
        <StatusBadge status={entry.status} />
      </td>
      <td>
        {entry.duration_ms == null ? "—" : formatDuration(entry.duration_ms)}
      </td>
      <td>
        {entry.error_message ? (
          <Box
            onClick={() => setExpanded((v) => !v)}
            style={{ cursor: "pointer" }}
          >
            {expanded ? (
              <Text>{entry.error_message}</Text>
            ) : (
              <Text truncate="end">{entry.error_message}</Text>
            )}
          </Box>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "success":
      return (
        <Badge color="success" variant="light">
          {t`Success`}
        </Badge>
      );
    case "failed":
      return (
        <Badge color="error" variant="light">
          {t`Failed`}
        </Badge>
      );
    case "started":
      return (
        <Badge color="warning" variant="light">
          {t`In progress`}
        </Badge>
      );
    default:
      return <Badge variant="light">{status}</Badge>;
  }
};
