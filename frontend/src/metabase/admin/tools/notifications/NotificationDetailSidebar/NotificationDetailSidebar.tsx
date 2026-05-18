import type { ReactNode } from "react";
import { Children, Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  skipToken,
  useAdminNotificationDetailQuery,
  useBulkNotificationActionMutation,
  useGetCardQuery,
  useListTaskRunsQuery,
} from "metabase/api";
import { Link as MBLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ADMIN_NAVBAR_HEIGHT } from "metabase/nav/constants";
import {
  AlertModalSettingsBlock,
  CreateOrEditQuestionAlertModal,
} from "metabase/notifications/modals/CreateOrEditQuestionAlertModal";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Divider,
  Drawer,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type {
  AdminNotification,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationId,
  NotificationRecipient,
  TaskRun,
  TaskRunStatus,
} from "metabase-types/api";

import {
  formatRelativeDate,
  getChannelIconName,
} from "../NotificationsAdminPage/utils";
import type { UserOption } from "../UserPicker";
import { UserPicker } from "../UserPicker";

import S from "./NotificationDetailSidebar.module.css";
import {
  RECENT_RUNS_FETCH_LIMIT,
  RECENT_RUNS_LIMIT,
  SIDEBAR_WIDTH,
} from "./constants";
import type {
  ChannelAvatarProps,
  DetailsRowProps,
  DetailsSectionProps,
  EmailRecipientsSectionProps,
  NotificationEditModalLoaderProps,
  OwnerSectionProps,
  RunHistorySectionProps,
  SidebarHeaderProps,
  SidebarProps,
  SidebarSectionProps,
  SlackChannelsSectionProps,
} from "./types";
import {
  formatChannelSummary,
  getEmailRowText,
  getUniqueChannelTypes,
} from "./utils";

export const NotificationDetailSidebar = ({
  notificationId,
  isBulkLoading,
  prevNotificationId,
  nextNotificationId,
  onClose,
  onDelete,
}: SidebarProps) => {
  const {
    data: notification,
    error,
    isLoading,
  } = useAdminNotificationDetailQuery(notificationId);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  return (
    <>
      <Drawer
        opened
        onClose={onClose}
        position="right"
        size={SIDEBAR_WIDTH}
        withCloseButton={false}
        padding={0}
        withOverlay={false}
        lockScroll={false}
        shadow="lg"
        zIndex={100}
        styles={{
          inner: {
            top: ADMIN_NAVBAR_HEIGHT,
            height: `calc(100vh - ${ADMIN_NAVBAR_HEIGHT})`,
          },
        }}
      >
        <Stack h="100%" p="lg" gap="lg">
          {isLoading || error || !notification ? (
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          ) : (
            <>
              <SidebarHeader
                isBulkLoading={isBulkLoading}
                notification={notification}
                prevNotificationId={prevNotificationId}
                nextNotificationId={nextNotificationId}
                onClose={onClose}
                onDelete={onDelete}
                onEdit={() => setIsEditModalOpen(true)}
              />
              <SidebarBody notification={notification} />
            </>
          )}
        </Stack>
      </Drawer>
      {isEditModalOpen && notification && (
        <NotificationEditModalLoader
          notification={notification}
          onClose={() => setIsEditModalOpen(false)}
          onUpdated={() => setIsEditModalOpen(false)}
        />
      )}
    </>
  );
};

const SidebarHeader = ({
  isBulkLoading,
  notification,
  prevNotificationId,
  nextNotificationId,
  onClose,
  onDelete,
  onEdit,
}: SidebarHeaderProps) => {
  const cardName = notification.payload?.card?.name ?? t`Untitled question`;
  const dispatch = useDispatch();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${Urls.adminToolsNotificationDetail(notification.id)}`;
    await navigator.clipboard.writeText(url);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  };

  const handleNavigate = (id: NotificationId | null) => {
    if (id !== null) {
      dispatch(push(Urls.adminToolsNotificationDetail(id)));
    }
  };

  return (
    <Stack gap="lg">
      <Flex justify="space-between" align="center">
        <Group gap="sm">
          <ActionIcon
            aria-label={t`Previous alert`}
            size="lg"
            variant="default"
            className={S.navButton}
            disabled={prevNotificationId === null}
            onClick={() => handleNavigate(prevNotificationId)}
          >
            <Icon name="chevronup" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Next alert`}
            size="lg"
            variant="default"
            className={S.navButton}
            disabled={nextNotificationId === null}
            onClick={() => handleNavigate(nextNotificationId)}
          >
            <Icon name="chevrondown" />
          </ActionIcon>
        </Group>
        <Group gap="sm">
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                aria-label={t`More actions`}
                size="lg"
                c="icon-primary"
                disabled={isBulkLoading}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="link" />}
                onClick={handleCopyLink}
              >
                {t`Copy link to clipboard`}
              </Menu.Item>
              {notification.active && (
                <Menu.Item
                  c="danger"
                  leftSection={<Icon name="trash" />}
                  onClick={() => onDelete(notification)}
                >
                  {t`Delete alert`}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
          <ActionIcon
            aria-label={t`Edit`}
            size="lg"
            c="icon-primary"
            disabled={isBulkLoading}
            onClick={onEdit}
          >
            <Icon name="pencil" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Close`}
            size="lg"
            c="icon-primary"
            onClick={onClose}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
      </Flex>

      <Flex align="center" gap="sm">
        <ChannelAvatarStack handlers={notification.handlers} />
        <Stack gap={2}>
          <Text size="xs" c="text-secondary">
            {t`Alert ${notification.id}`}
          </Text>
          <Title order={3} lh={1.2} c="text-primary">
            {cardName}
          </Title>
        </Stack>
      </Flex>
    </Stack>
  );
};

const ChannelAvatarStack = ({
  handlers,
}: {
  handlers: NotificationHandler[] | undefined;
}) => {
  const channels = getUniqueChannelTypes(handlers);

  return (
    <Flex align="center" className={S.avatarStack}>
      {channels.map((channel, index) => (
        <Box
          key={channel}
          ml={index === 0 ? 0 : -18}
          style={{ zIndex: channels.length - index }}
        >
          <ChannelAvatar channel={channel} bordered={channels.length > 1} />
        </Box>
      ))}
    </Flex>
  );
};

const ChannelAvatar = ({ channel, bordered }: ChannelAvatarProps) => {
  const { backgroundColor, iconColor } = match(channel)
    .with("channel/slack", () => ({
      backgroundColor:
        "color-mix(in srgb, var(--mb-color-saturated-purple) 10%, white)",
      iconColor: "saturated-purple" as const,
    }))
    .otherwise(() => ({
      backgroundColor: "var(--mb-color-background-brand)",
      iconColor: "brand" as const,
    }));

  return (
    <Flex
      align="center"
      justify="center"
      w={36}
      h={36}
      bd={bordered ? "2px solid var(--mb-color-background-primary)" : undefined}
      bdrs="50%"
      className={S.channelAvatar}
      style={{ backgroundColor }}
    >
      <Icon
        name={channel ? getChannelIconName(channel) : "bell"}
        c={iconColor}
        size={16}
      />
    </Flex>
  );
};

const SidebarBody = ({ notification }: { notification: AdminNotification }) => {
  const handlers = notification.handlers ?? [];
  const emailHandler = handlers.find(
    (handler): handler is NotificationHandlerEmail =>
      handler.channel_type === "channel/email",
  );
  const slackHandler = handlers.find(
    (handler): handler is NotificationHandlerSlack =>
      handler.channel_type === "channel/slack",
  );
  const httpHandler = handlers.find(
    (handler): handler is NotificationHandlerHttp =>
      handler.channel_type === "channel/http",
  );
  const emailRecipientCount = emailHandler?.recipients.length ?? 0;
  const slackChannelCount = slackHandler?.recipients.length ?? 0;

  return (
    <Stack gap="xl">
      <DetailsSection
        notification={notification}
        emailRecipientCount={emailRecipientCount}
        slackChannelCount={slackChannelCount}
        httpHandler={httpHandler}
      />
      <RunsSections notification={notification} />
      {emailHandler && emailRecipientCount > 0 && (
        <EmailRecipientsSection
          handler={emailHandler}
          count={emailRecipientCount}
        />
      )}
      {slackHandler && slackChannelCount > 0 && (
        <SlackChannelsSection
          handler={slackHandler}
          count={slackChannelCount}
        />
      )}
    </Stack>
  );
};

const DetailsSection = ({
  notification,
  emailRecipientCount,
  slackChannelCount,
  httpHandler,
}: DetailsSectionProps) => {
  const cardId = notification.payload?.card_id;
  const cardName = notification.payload?.card?.name;
  const lastCheck = notification.last_check;
  const lastSent = notification.last_sent;
  const lastCheckDate = formatRelativeDate(lastCheck?.at);
  const lastSentDate = formatRelativeDate(lastSent?.at);
  const checkError = lastCheck?.status === "failing" ? lastCheck.error : null;
  const sentError = lastSent?.status === "failing" ? lastSent.error : null;
  const channelSummary = formatChannelSummary({
    emailRecipientCount,
    slackChannelCount,
    httpHandler,
  });
  const owner = notification.owner;
  const ownerName = owner?.common_name ?? owner?.email ?? t`Unknown`;

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`Question`}
          value={
            cardId !== undefined && cardName ? (
              <MBLink
                variant="brandBold"
                to={Urls.card({ id: cardId, name: cardName })}
              >
                {cardName}
              </MBLink>
            ) : (
              (cardName ?? t`Unknown`)
            )
          }
          bold
        />
        <DetailsRow label={t`Owner`} value={ownerName} />
        <DetailsRow
          label={t`Channel`}
          value={channelSummary || t`No channels`}
        />
        <DetailsRow
          label={t`Last checked`}
          value={
            <Stack gap={4}>
              <Text size="md" c="text-primary">
                {lastCheckDate}
              </Text>
              {checkError && (
                <Flex align="center" gap="xs">
                  <Text size="sm" c="error">
                    {checkError}
                  </Text>
                  <Icon name="warning_round" c="error" size={14} />
                </Flex>
              )}
            </Stack>
          }
        />
        <DetailsRow
          label={t`Last send attempt`}
          value={
            <Stack gap={4}>
              <Text size="md" c="text-primary">
                {lastSentDate}
              </Text>
              {sentError && (
                <Flex align="center" gap="xs">
                  <Text size="sm" c="error">
                    {sentError}
                  </Text>
                  <Icon name="warning_round" c="error" size={14} />
                </Flex>
              )}
            </Stack>
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
};

const RunsSections = ({
  notification,
}: {
  notification: AdminNotification;
}) => {
  const cardId = notification.payload?.card_id;
  const { data: taskRunsData, isLoading } = useListTaskRunsQuery(
    cardId !== undefined
      ? {
          limit: RECENT_RUNS_FETCH_LIMIT,
          offset: 0,
          "run-type": "alert",
          "entity-type": "card",
          "entity-id": cardId,
        }
      : undefined,
    { skip: cardId === undefined },
  );

  if (cardId === undefined) {
    return null;
  }

  const allRuns = taskRunsData?.data ?? [];
  const checks = allRuns.slice(0, RECENT_RUNS_LIMIT);
  const sends = allRuns
    .filter((run) => run.status === "success")
    .slice(0, RECENT_RUNS_LIMIT);

  const viewAllUrl = Urls.adminToolsTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
  });

  return (
    <>
      <RunHistorySection
        title={t`Check history`}
        viewAllUrl={viewAllUrl}
        runs={checks}
        isLoading={isLoading}
      />
      <RunHistorySection
        title={t`Send history`}
        viewAllUrl={viewAllUrl}
        runs={sends}
        isLoading={isLoading}
      />
    </>
  );
};

const RunHistorySection = ({
  title,
  viewAllUrl,
  runs,
  isLoading,
}: RunHistorySectionProps) => (
  <SidebarSection
    title={title}
    titleAside={
      <Anchor
        component={Link}
        to={viewAllUrl}
        c="brand"
        fz="md"
        lh="1rem"
        fw="bold"
      >
        {t`View all`}
      </Anchor>
    }
  >
    <DetailsTable>
      {isLoading || runs.length === 0 ? (
        <DetailsRow
          label={isLoading ? t`Loading…` : t`No runs in the past 30 days.`}
          value=""
          bold={false}
          spanLabel
        />
      ) : (
        runs.map((taskRun) => <RunRow key={taskRun.id} taskRun={taskRun} />)
      )}
    </DetailsTable>
  </SidebarSection>
);

const RunRow = ({ taskRun }: { taskRun: TaskRun }) => {
  const formatted = formatRelativeDate(taskRun.started_at);
  return (
    <Flex align="center" justify="space-between" px="md" py="sm" gap="sm">
      <Text size="md" c="text-primary">
        {formatted}
      </Text>
      <RunStatusBadge status={taskRun.status} />
    </Flex>
  );
};

const RunStatusBadge = ({ status }: { status: TaskRunStatus }) => {
  if (status === "failed" || status === "abandoned") {
    return (
      <Badge color="error" variant="light" radius="lg" tt="none" fw="normal">
        {t`Failed`}
      </Badge>
    );
  }
  if (status === "started") {
    return (
      <Badge color="warning" variant="light" radius="lg" tt="none" fw="normal">
        {t`Running`}
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge
        variant="outline"
        radius="lg"
        tt="none"
        fw="normal"
        c="text-secondary"
        bd="1px solid var(--mb-color-border)"
      >
        {t`Successful`}
      </Badge>
    );
  }
  return null;
};

const EmailRecipientsSection = ({
  handler,
  count,
}: EmailRecipientsSectionProps) => {
  const title =
    count === 1 ? t`1 email recipient` : t`${count} email recipients`;

  return (
    <SidebarSection title={title}>
      <DetailsTable>
        {handler.recipients.map((recipient, index) => (
          <EmailRow key={recipient.id ?? index} recipient={recipient} />
        ))}
      </DetailsTable>
    </SidebarSection>
  );
};

const EmailRow = ({ recipient }: { recipient: NotificationRecipient }) => {
  const { name, email } = getEmailRowText(recipient);
  return (
    <Flex align="center" justify="space-between" px="md" py="sm" gap="sm">
      <Text size="md" c="text-primary">
        {name}
      </Text>
      {email && (
        <Text size="md" c="text-secondary">
          {email}
        </Text>
      )}
    </Flex>
  );
};

const SlackChannelsSection = ({
  handler,
  count,
}: SlackChannelsSectionProps) => {
  const title = count === 1 ? t`1 Slack channel` : t`${count} Slack channels`;

  return (
    <SidebarSection title={title}>
      <DetailsTable>
        {handler.recipients.map((recipient, index) => (
          <SlackRow
            key={recipient.id ?? index}
            value={recipient.details?.value ?? ""}
          />
        ))}
      </DetailsTable>
    </SidebarSection>
  );
};

const SlackRow = ({ value }: { value: string }) => (
  <Flex align="center" px="md" py="sm">
    <Text size="md" c="text-primary">
      {value}
    </Text>
  </Flex>
);

const SidebarSection = ({
  title,
  titleAside,
  children,
}: SidebarSectionProps) => (
  <Stack gap="md">
    <Flex justify="space-between" align="center">
      <Text fw="bold" size="md" lh="1rem" c="text-primary">
        {title}
      </Text>
      {titleAside}
    </Flex>
    {children}
  </Stack>
);

const DetailsTable = ({ children }: { children: ReactNode }) => {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Box
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      className={S.detailsTable}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider />}
          {item}
        </Fragment>
      ))}
    </Box>
  );
};

const DetailsRow = ({ label, value, bold, spanLabel }: DetailsRowProps) => {
  if (spanLabel) {
    return (
      <Flex align="center" px="md" py="sm" bg="background-primary">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
      </Flex>
    );
  }
  return (
    <Flex>
      <Flex w={160} px="md" py="sm" bg="background-secondary">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
      </Flex>
      <Divider orientation="vertical" />
      <Flex flex={1} align="center" px="md" py="sm" miw={0}>
        {typeof value === "string" ? (
          <Text size="md" fw={bold ? "bold" : "normal"} c="text-primary">
            {value}
          </Text>
        ) : (
          <Box w="100%">{value}</Box>
        )}
      </Flex>
    </Flex>
  );
};

const NotificationEditModalLoader = ({
  notification,
  onClose,
  onUpdated,
}: NotificationEditModalLoaderProps) => {
  const cardId = notification.payload?.card_id;
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const { data: card, isFetching } = useGetCardQuery(
    cardId !== undefined ? { id: cardId } : skipToken,
  );

  useEffect(() => {
    if (card) {
      dispatch(loadMetadataForCard(card));
    }
  }, [card, dispatch]);

  const question = useMemo(() => {
    if (!card || isFetching) {
      return undefined;
    }
    return new Question(card, metadata);
  }, [card, isFetching, metadata]);

  const initialOwnerId = notification.owner_id ?? notification.owner.id;
  const [selectedOwner, setSelectedOwner] = useState<UserOption>(() => {
    const owner = notification.owner;
    const label = owner.common_name || owner.email || t`Unknown`;
    return {
      id: initialOwnerId,
      label: !owner.is_active ? t`${label} (deactivated)` : label,
    };
  });
  const [bulkAction] = useBulkNotificationActionMutation();

  const handleOwnerSubmit = async () => {
    if (selectedOwner.id === initialOwnerId) {
      return true;
    }
    const result = await bulkAction({
      notification_ids: [notification.id],
      action: "change-owner",
      owner_id: selectedOwner.id,
    });
    if (result.error) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`Could not change owner.`,
        }),
      );
      return false;
    }
    return true;
  };

  if (cardId === undefined || !question) {
    return null;
  }

  return (
    <CreateOrEditQuestionAlertModal
      question={question}
      editingNotification={notification}
      skipUrlUpdate
      extraSection={
        <OwnerSection
          selectedOwner={selectedOwner}
          onChange={setSelectedOwner}
        />
      }
      additionalSubmit={handleOwnerSubmit}
      onAlertUpdated={onUpdated}
      onClose={onClose}
    />
  );
};

const OwnerSection = ({ selectedOwner, onChange }: OwnerSectionProps) => (
  <AlertModalSettingsBlock title={t`Who owns this alert?`}>
    <Flex align="center" gap="md">
      <Text fw="bold" size="md" c="text-primary" w={56}>
        {t`Owner`}
      </Text>
      <UserPicker flex={1} value={selectedOwner} onChange={onChange} />
    </Flex>
  </AlertModalSettingsBlock>
);
