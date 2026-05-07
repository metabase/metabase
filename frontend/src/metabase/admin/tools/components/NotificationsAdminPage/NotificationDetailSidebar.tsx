import { Children, Fragment } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useAdminNotificationDetailQuery,
  useListTaskRunsQuery,
} from "metabase/api";
import { Link as MBLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ADMIN_NAVBAR_HEIGHT } from "metabase/nav/constants";
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
import type {
  AdminNotificationDetail,
  NotificationChannelType,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationId,
  NotificationRecipient,
  TaskRun,
  TaskRunStatus,
} from "metabase-types/api";

import { formatRelativeDate, getChannelIconName } from "./utils";

export const SIDEBAR_WIDTH = 560;
const RECENT_RUNS_LIMIT = 5;

type Props = {
  notificationId: NotificationId;
  isBulkLoading: boolean;
  onClose: () => void;
  onArchive: (notification: AdminNotificationDetail) => void;
  onUnarchive: (notification: AdminNotificationDetail) => void;
  onChangeOwner: (notification: AdminNotificationDetail) => void;
};

export const NotificationDetailSidebar = ({
  notificationId,
  isBulkLoading,
  onClose,
  onArchive,
  onUnarchive,
  onChangeOwner,
}: Props) => {
  const {
    data: notification,
    error,
    isLoading,
  } = useAdminNotificationDetailQuery(notificationId);

  return (
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
      styles={{
        inner: {
          top: ADMIN_NAVBAR_HEIGHT,
          height: `calc(100vh - ${ADMIN_NAVBAR_HEIGHT})`,
        },
      }}
    >
      <Stack gap={0} h="100%">
        <SidebarHeader
          isBulkLoading={isBulkLoading}
          notification={notification}
          onClose={onClose}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onChangeOwner={onChangeOwner}
        />
        <Box px="xl" pb="xl" style={{ overflowY: "auto" }} flex={1}>
          {isLoading || error || !notification ? (
            <LoadingAndErrorWrapper loading={isLoading} error={error} />
          ) : (
            <SidebarBody notification={notification} />
          )}
        </Box>
      </Stack>
    </Drawer>
  );
};

type SidebarHeaderProps = {
  isBulkLoading: boolean;
  notification: AdminNotificationDetail | undefined;
  onClose: () => void;
  onArchive: (notification: AdminNotificationDetail) => void;
  onUnarchive: (notification: AdminNotificationDetail) => void;
  onChangeOwner: (notification: AdminNotificationDetail) => void;
};

const SidebarHeader = ({
  isBulkLoading,
  notification,
  onClose,
  onArchive,
  onUnarchive,
  onChangeOwner,
}: SidebarHeaderProps) => {
  const cardName = notification?.payload?.card?.name ?? t`Untitled question`;

  return (
    <Box px="xl" pt="lg" pb="md">
      <Flex justify="flex-end" align="center" mb="md">
        <Group gap={4}>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                aria-label={t`More actions`}
                size="lg"
                disabled={notification == null || isBulkLoading}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {notification?.active ? (
                <Menu.Item
                  leftSection={<Icon name="archive" />}
                  onClick={() => notification && onArchive(notification)}
                >
                  {t`Archive`}
                </Menu.Item>
              ) : (
                <Menu.Item
                  leftSection={<Icon name="unarchive" />}
                  onClick={() => notification && onUnarchive(notification)}
                >
                  {t`Unarchive`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="person" />}
                onClick={() => notification && onChangeOwner(notification)}
              >
                {t`Change owner`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <ActionIcon aria-label={t`Edit`} size="lg" disabled={true}>
            <Icon name="pencil" />
          </ActionIcon>
          <ActionIcon aria-label={t`Close`} size="lg" onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </Group>
      </Flex>

      {notification && (
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
      )}
    </Box>
  );
};

const ChannelAvatarStack = ({
  handlers,
}: {
  handlers: NotificationHandler[] | undefined;
}) => {
  const channels = getUniqueChannelTypes(handlers);

  return (
    <Flex align="center" style={{ flexShrink: 0 }}>
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

type ChannelAvatarProps = {
  channel: NotificationChannelType;
  bordered: boolean;
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
      style={{ flexShrink: 0, backgroundColor }}
    >
      <Icon
        name={channel ? getChannelIconName(channel) : "bell"}
        c={iconColor}
        size={16}
      />
    </Flex>
  );
};

const getUniqueChannelTypes = (
  handlers: NotificationHandler[] | undefined,
): NotificationChannelType[] => {
  if (!handlers) {
    return [];
  }
  const seen = new Set<NotificationChannelType>();
  const result: NotificationChannelType[] = [];
  for (const handler of handlers) {
    if (!seen.has(handler.channel_type)) {
      seen.add(handler.channel_type);
      result.push(handler.channel_type);
    }
  }
  return result;
};

const SidebarBody = ({
  notification,
}: {
  notification: AdminNotificationDetail;
}) => {
  const handlers = notification.handlers ?? [];
  const emailHandler = findEmailHandler(handlers);
  const slackHandler = findSlackHandler(handlers);
  const httpHandler = findHttpHandler(handlers);
  const emailRecipientCount = emailHandler?.recipients.length ?? 0;
  const slackChannelCount = slackHandler?.recipients.length ?? 0;

  return (
    <Stack gap="xl" mt="lg">
      <DetailsSection
        notification={notification}
        emailRecipientCount={emailRecipientCount}
        slackChannelCount={slackChannelCount}
        httpHandler={httpHandler}
      />
      <RunsSection notification={notification} />
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

const findEmailHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerEmail | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/email") {
      return handler;
    }
  }
  return undefined;
};

const findSlackHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerSlack | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/slack") {
      return handler;
    }
  }
  return undefined;
};

const findHttpHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerHttp | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/http") {
      return handler;
    }
  }
  return undefined;
};

type DetailsSectionProps = {
  notification: AdminNotificationDetail;
  emailRecipientCount: number;
  slackChannelCount: number;
  httpHandler: NotificationHandlerHttp | undefined;
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
  const isOwnerDeactivated = owner?.is_active === false;

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`Question`}
          value={
            cardId != null && cardName ? (
              <MBLink
                variant="brand"
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
        <DetailsRow
          label={t`Owner`}
          value={
            <Flex align="center" gap="xs">
              <Text size="md" c="text-primary">
                {ownerName}
              </Text>
              {isOwnerDeactivated && (
                <Text size="md" c="text-secondary">
                  {t`(deactivated)`}
                </Text>
              )}
            </Flex>
          }
        />
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
          label={t`Last sent`}
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

const formatChannelSummary = ({
  emailRecipientCount,
  slackChannelCount,
  httpHandler,
}: {
  emailRecipientCount: number;
  slackChannelCount: number;
  httpHandler: NotificationHandlerHttp | undefined;
}): string => {
  const parts: string[] = [];
  if (emailRecipientCount > 0) {
    parts.push(
      emailRecipientCount === 1
        ? t`1 email recipient`
        : t`${emailRecipientCount} email recipients`,
    );
  }
  if (slackChannelCount > 0) {
    parts.push(
      slackChannelCount === 1
        ? t`1 Slack channel`
        : t`${slackChannelCount} Slack channels`,
    );
  }
  if (httpHandler && httpHandler.recipients.length > 0) {
    const count = httpHandler.recipients.length;
    parts.push(count === 1 ? t`1 webhook` : t`${count} webhooks`);
  }
  return parts.join(", ");
};

const RunsSection = ({
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
    <SidebarSection
      title={t`Last checks and send attempts`}
      titleAside={
        <Anchor component={Link} to={runsUrl} c="brand" fz="md" fw="bold">
          {t`View all alert runs`}
        </Anchor>
      }
    >
      <DetailsTable>
        <RunsHeaderRow />
        {isLoading || taskRuns.length === 0 ? (
          <DetailsRow
            label={isLoading ? t`Loading…` : t`No runs in the past 30 days.`}
            value=""
            bold={false}
            spanLabel
          />
        ) : (
          taskRuns.map((taskRun) => (
            <RunsRow key={taskRun.id} taskRun={taskRun} />
          ))
        )}
      </DetailsTable>
    </SidebarSection>
  );
};

const RunsHeaderRow = () => (
  <Flex bg="background-secondary">
    <Flex align="center" px="md" py="sm" flex={1}>
      <Text size="md" c="text-secondary">
        {t`Question checks`}
      </Text>
    </Flex>
    <Divider orientation="vertical" />
    <Flex align="center" px="md" py="sm" flex={1}>
      <Text size="md" c="text-secondary">
        {t`Alert send attempts`}
      </Text>
    </Flex>
  </Flex>
);

const RunsRow = ({ taskRun }: { taskRun: TaskRun }) => {
  const formatted = formatRelativeDate(taskRun.started_at);
  return (
    <Flex>
      <Flex align="center" px="md" py="sm" flex={1}>
        <Text size="md" c="text-primary">
          {formatted}
        </Text>
      </Flex>
      <Divider orientation="vertical" />
      <Flex
        align="center"
        justify="space-between"
        px="md"
        py="sm"
        flex={1}
        gap="sm"
      >
        <Text size="md" c="text-primary">
          {formatted}
        </Text>
        <RunStatusBadge status={taskRun.status} />
      </Flex>
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
  return null;
};

type EmailRecipientsSectionProps = {
  handler: NotificationHandlerEmail;
  count: number;
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

const getEmailRowText = (
  recipient: NotificationRecipient,
): { name: string; email: string | null } => {
  if (recipient.type === "notification-recipient/user") {
    const user = recipient.user;
    if (!user) {
      return { name: t`Deactivated user`, email: null };
    }
    return {
      name: user.common_name ?? user.email ?? t`Unknown`,
      email: user.email ?? null,
    };
  }
  if (recipient.type === "notification-recipient/raw-value") {
    const value = recipient.details?.value ?? "";
    return { name: value, email: null };
  }
  return { name: t`Group recipient`, email: null };
};

type SlackChannelsSectionProps = {
  handler: NotificationHandlerSlack;
  count: number;
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

type SidebarSectionProps = {
  title: string;
  titleAside?: React.ReactNode;
  children: React.ReactNode;
};

const SidebarSection = ({
  title,
  titleAside,
  children,
}: SidebarSectionProps) => (
  <Stack gap="sm">
    <Flex justify="space-between" align="center">
      <Text fw="bold" size="md" c="text-primary">
        {title}
      </Text>
      {titleAside}
    </Flex>
    {children}
  </Stack>
);

const DetailsTable = ({ children }: { children: React.ReactNode }) => {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Box
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      style={{ overflow: "hidden" }}
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

type DetailsRowProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  bold?: boolean;
  spanLabel?: boolean;
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
