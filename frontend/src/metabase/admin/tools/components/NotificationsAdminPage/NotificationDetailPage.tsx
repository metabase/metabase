import dayjs from "dayjs";
import { useCallback, useState } from "react";
import type { WithRouterProps } from "react-router";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useAdminNotificationDetailQuery,
  useBulkNotificationActionMutation,
  useListTaskRunsQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Link as MBLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { formatNotificationSchedule } from "metabase/notifications/utils";
import { addUndo } from "metabase/redux/undo";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Flex,
  Grid,
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
  TaskRun,
} from "metabase-types/api";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "../../../components/SettingsSection";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";

import { ChangeOwnerModal } from "./ChangeOwnerModal";
import {
  getChannelIconName,
  getChannelLabel,
  getHealthColor,
  getHealthLabel,
} from "./utils";

const RECENT_RUNS_LIMIT = 5;

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
          <BackLink />
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
        <BackLink />

        <DetailHeader
          notification={notification}
          isOrphanedCard={isOrphanedCard}
          isBulkLoading={isBulkLoading}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onChangeOwner={() => setIsChangeOwnerOpen(true)}
        />

        <Grid gutter="xl">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <DetailsSection
              notification={notification}
              isOrphanedCreator={isOrphanedCreator}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <RecipientsSection handlers={handlers} />
          </Grid.Col>
        </Grid>

        <SendHistorySection notification={notification} />

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

const BackLink = () => (
  <Anchor
    component={Link}
    to={Urls.adminToolsNotifications()}
    c="text-secondary"
    underline="never"
  >
    <Flex align="center" gap="xs">
      <Icon name="chevronleft" />
      {t`Back to notifications`}
    </Flex>
  </Anchor>
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
      <Stack gap={4}>
        <Group gap="sm" align="center">
          {cardId != null && !isOrphanedCard ? (
            <Title order={2}>
              <MBLink
                variant="brand"
                to={Urls.question({ id: cardId, name: cardName })}
              >
                {cardName}
              </MBLink>
            </Title>
          ) : (
            <Title order={2}>{cardName}</Title>
          )}
          <Badge color={getHealthColor(notification.health)} variant="light">
            {getHealthLabel(notification.health)}
          </Badge>
          {isOrphanedCard && (
            <Badge color="error" variant="light">{t`Deleted`}</Badge>
          )}
        </Group>
        <Text c="text-secondary" size="sm">{t`Alert #${notification.id}`}</Text>
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

type DetailsSectionProps = {
  notification: AdminNotificationDetail;
  isOrphanedCreator: boolean;
};

const DetailsSection = ({
  notification,
  isOrphanedCreator,
}: DetailsSectionProps) => {
  const creator = notification.creator;
  const handlers = notification.handlers ?? [];
  const subscriptions = notification.subscriptions ?? [];

  return (
    <Stack gap="md">
      <Title order={3}>{t`Details`}</Title>

      <InfoRow label={t`Creator`}>
        <Group gap="xs" wrap="nowrap">
          {creator ? (
            <Text>
              {creator.common_name ?? creator.email ?? t`Unknown`}
              {creator.email ? (
                <Text component="span" c="text-secondary">
                  {" "}
                  {`<${creator.email}>`}
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text c="text-secondary">{t`Unknown`}</Text>
          )}
          {isOrphanedCreator && (
            <Badge color="warning" variant="light">{t`Deactivated`}</Badge>
          )}
        </Group>
      </InfoRow>

      <InfoRow label={t`Schedule`}>
        {subscriptions.length > 0 ? (
          <Stack gap={2}>
            {subscriptions.map((subscription) => {
              const formatted = formatNotificationSchedule(subscription);
              return (
                <Text key={subscription.id ?? subscription.cron_schedule}>
                  {formatted ?? subscription.cron_schedule}
                </Text>
              );
            })}
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
          <Tooltip label={dayjs(notification.last_sent_at).fromNow()}>
            <DateTime value={notification.last_sent_at} unit="minute" />
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
    <Text fw="bold" w={120} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Box style={{ flex: 1 }}>{children}</Box>
  </Flex>
);

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
    <Stack gap="md">
      <Title order={3}>{t`Recipients`}</Title>
      {recipients.length === 0 ? (
        <Text c="text-secondary">{t`No recipients`}</Text>
      ) : (
        <Stack gap="xs">
          {recipients.map(({ handler, recipient }, index) => (
            <RecipientLine
              key={`${handler.id ?? "handler"}-${recipient.id ?? index}`}
              recipient={recipient}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

const RecipientLine = ({ recipient }: { recipient: NotificationRecipient }) => {
  if (recipient.type === "notification-recipient/user") {
    const user = recipient.user;
    // `recipients-detail` hydration drops deactivated users (sets :user nil on
    // the recipient), so a missing user here means the underlying user is
    // deactivated or has been deleted.
    const isActive = user != null;
    const name = user?.common_name ?? user?.email ?? t`Deactivated user`;
    return (
      <Flex gap="sm" align="center" wrap="wrap">
        <Text fw="bold">{name}</Text>
        {user?.email && <Text c="text-secondary">{user.email}</Text>}
        {!isActive && (
          <Badge color="warning" variant="light">{t`Deactivated`}</Badge>
        )}
      </Flex>
    );
  }
  if (recipient.type === "notification-recipient/raw-value") {
    return (
      <Flex gap="sm" align="center" wrap="wrap">
        <Text>{recipient.details?.value ?? "—"}</Text>
        <Badge variant="light">{t`External`}</Badge>
      </Flex>
    );
  }
  return (
    <Flex gap="sm" align="center">
      <Badge variant="light">{t`Group`}</Badge>
    </Flex>
  );
};

const SendHistorySection = ({
  notification,
}: {
  notification: AdminNotificationDetail;
}) => {
  const cardId = notification.payload?.card_id;

  const { data: taskRunsData, isLoading } = useListTaskRunsQuery(
    cardId != null
      ? {
          limit: RECENT_RUNS_LIMIT,
          offset: 0,
          "run-type": "alert",
          "entity-type": "card",
          "entity-id": cardId,
        }
      : undefined,
    { skip: cardId == null },
  );

  if (cardId == null) {
    return null;
  }

  const taskRuns = taskRunsData?.data ?? [];
  const runsUrl = Urls.adminToolsTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
    startedAt: "past30days~",
  });

  return (
    <Stack gap="md">
      <Title order={3}>{t`Send history`}</Title>
      {isLoading ? (
        <Text c="text-secondary">{t`Loading…`}</Text>
      ) : taskRuns.length === 0 ? (
        <Text c="text-secondary">{t`No send runs yet.`}</Text>
      ) : (
        <Stack gap="xs">
          {taskRuns.map((taskRun) => (
            <SendHistoryRow key={taskRun.id} taskRun={taskRun} />
          ))}
        </Stack>
      )}

      <Flex align="center" gap="xs">
        <Anchor component={Link} to={runsUrl} c="text-secondary">
          <Flex align="center" gap="xs">
            {t`View all runs for this card`}
            <Icon name="external" size={12} />
          </Flex>
        </Anchor>
      </Flex>

      <Text c="text-tertiary" size="sm">
        {t`Runs are shared across every alert on the same card.`}
      </Text>
    </Stack>
  );
};

const SendHistoryRow = ({ taskRun }: { taskRun: TaskRun }) => {
  const detailUrl = Urls.adminToolsTaskRunDetails(taskRun.id);
  return (
    <Flex align="center" gap="sm">
      <Anchor component={Link} to={detailUrl}>
        <DateTime value={taskRun.started_at} unit="minute" />
      </Anchor>
      <TaskRunStatusBadge taskRun={taskRun} />
    </Flex>
  );
};
