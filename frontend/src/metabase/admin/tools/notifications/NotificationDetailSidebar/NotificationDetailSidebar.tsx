import type { ReactNode } from "react";
import { Children, Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useAdminNotificationDetailQuery,
  useGetCardQuery,
} from "metabase/api";
import { Link as MBLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ADMIN_NAVBAR_HEIGHT } from "metabase/nav/constants";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal";
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
  Loader,
  Menu,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type {
  AdminNotification,
  AdminNotificationDetail,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationId,
} from "metabase-types/api";

import {
  formatRelativeDate,
  getChannelIconName,
} from "../NotificationsAdminPage/utils";

import S from "./NotificationDetailSidebar.module.css";
import { SIDEBAR_WIDTH } from "./constants";
import type {
  ChannelAvatarProps,
  DetailsRowProps,
  DetailsSectionProps,
  NotificationRunSummaryLogProps,
  SidebarHeaderProps,
  SidebarProps,
  SidebarSectionProps,
} from "./types";
import {
  formatChannelSummary,
  getEmailRecipientLabel,
  getEmailRowText,
  getSlackChannelLabel,
} from "./utils";

export const NotificationDetailSidebar = ({
  notificationId,
  notificationSummary,
  isBulkLoading,
  prevNotificationId,
  nextNotificationId,
  onClose,
  onDelete,
}: SidebarProps) => {
  const { currentData: detail, isFetching: isDetailFetching } =
    useAdminNotificationDetailQuery(notificationId);
  const notification = detail ?? notificationSummary;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setIsEditModalOpen(false);
  }, [notificationId]);

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const cardId = notification?.payload.card_id;
  const { currentData: card, isFetching: isCardLoading } = useGetCardQuery(
    cardId !== undefined ? { id: cardId } : skipToken,
  );

  useEffect(() => {
    if (card) {
      dispatch(loadMetadataForCard(card));
    }
  }, [card, dispatch]);

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

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
          <SidebarHeader
            isBulkLoading={isBulkLoading}
            notificationId={notificationId}
            notification={notification}
            prevNotificationId={prevNotificationId}
            nextNotificationId={nextNotificationId}
            isQuestionLoading={isCardLoading}
            onClose={onClose}
            onDelete={onDelete}
            onEdit={() => setIsEditModalOpen(true)}
          />
          {notification ? (
            <SidebarBody
              notification={notification}
              detail={detail}
              isDetailFetching={isDetailFetching}
            />
          ) : (
            <LoadingAndErrorWrapper loading />
          )}
        </Stack>
      </Drawer>
      {isEditModalOpen && notification && question && (
        <CreateOrEditQuestionAlertModal
          editingNotification={notification}
          question={question}
          skipUrlUpdate
          onAlertUpdated={() => setIsEditModalOpen(false)}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </>
  );
};

const SidebarHeader = ({
  isBulkLoading,
  notificationId,
  notification,
  prevNotificationId,
  nextNotificationId,
  isQuestionLoading,
  onClose,
  onDelete,
  onEdit,
}: SidebarHeaderProps) => {
  const cardName = notification?.payload.card?.name ?? t`Untitled question`;
  const dispatch = useDispatch();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${Urls.adminToolsNotificationDetail(notificationId)}`;
    await navigator.clipboard.writeText(url);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  };

  const handleNavigate = (id: NotificationId | undefined) => {
    if (id !== undefined) {
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
            disabled={prevNotificationId === undefined}
            onClick={() => handleNavigate(prevNotificationId)}
          >
            <Icon name="chevronup" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Next alert`}
            size="lg"
            variant="default"
            className={S.navButton}
            disabled={nextNotificationId === undefined}
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
              {notification?.active && (
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
            disabled={isQuestionLoading || isBulkLoading}
            onClick={!isQuestionLoading ? onEdit : undefined}
          >
            {isQuestionLoading ? <Loader size="sm" /> : <Icon name="pencil" />}
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

      {notification && (
        <Flex align="center" gap="sm">
          <ChannelAvatarStack handlers={notification.handlers} />
          <Stack gap={0}>
            <Text size="sm" c="text-secondary">
              {t`Alert ${notification.id}`}
            </Text>
            <Title order={3} c="text-primary">
              {cardName}
            </Title>
          </Stack>
        </Flex>
      )}
    </Stack>
  );
};

const ChannelAvatarStack = ({
  handlers,
}: {
  handlers: NotificationHandler[] | undefined;
}) => {
  const channels = _.uniq(
    (handlers ?? []).map((handler) => handler.channel_type),
  );

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

const SidebarBody = ({
  notification,
  isDetailFetching,
  detail,
}: {
  notification: AdminNotification;
  isDetailFetching: boolean;
  detail: AdminNotificationDetail | undefined;
}) => {
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

  const cardId = notification.payload.card_id;

  return (
    <Stack gap="xl">
      <DetailsSection
        notification={notification}
        emailRecipientCount={emailRecipientCount}
        slackChannelCount={slackChannelCount}
        httpHandler={httpHandler}
      />
      <NotificationRunSummaryLog
        title={t`Check history`}
        runs={detail?.send_history}
        isLoading={isDetailFetching}
        cardId={cardId}
      />
      <NotificationRunSummaryLog
        title={t`Send history`}
        runs={detail?.send_history}
        isLoading={isDetailFetching}
        cardId={cardId}
      />
      {emailHandler && emailRecipientCount > 0 && (
        <SidebarSection title={getEmailRecipientLabel(emailRecipientCount)}>
          <DetailsTable>
            {emailHandler.recipients.map((recipient, index) => {
              const { name, email } = getEmailRowText(recipient);
              return (
                <Flex
                  key={recipient.id ?? index}
                  align="center"
                  justify="space-between"
                  px="md"
                  py="sm"
                  gap="sm"
                >
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
            })}
          </DetailsTable>
        </SidebarSection>
      )}
      {slackHandler && slackChannelCount > 0 && (
        <SidebarSection title={getSlackChannelLabel(slackChannelCount)}>
          <DetailsTable>
            {slackHandler.recipients.map((recipient, index) => (
              <Flex key={recipient.id ?? index} align="center" px="md" py="sm">
                <Text size="md" c="text-primary">
                  {recipient.details?.value ?? ""}
                </Text>
              </Flex>
            ))}
          </DetailsTable>
        </SidebarSection>
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
  const cardId = notification.payload.card_id;
  const cardName = notification.payload.card?.name;
  const lastCheck = notification.last_check;
  const lastSend = notification.last_send;
  const lastCheckDate = formatRelativeDate(lastCheck?.at);
  const lastSendDate = formatRelativeDate(lastSend?.at);
  const checkError = lastCheck?.status === "failing" ? lastCheck.error : null;
  const sendError = lastSend?.status === "failing" ? lastSend.error : null;
  const channelSummary = formatChannelSummary({
    emailRecipientCount,
    slackChannelCount,
    httpHandler,
  });
  const creator = notification.creator;
  const ownerName = creator?.common_name ?? creator?.email ?? t`Unknown`;

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`Question`}
          value={
            cardName ? (
              <MBLink
                variant="brandBold"
                to={Urls.card({ id: cardId, name: cardName })}
              >
                {cardName}
              </MBLink>
            ) : (
              t`Unknown`
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
                {lastSendDate}
              </Text>
              {sendError && (
                <Flex align="center" gap="xs">
                  <Text size="sm" c="error">
                    {sendError}
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

const NotificationRunSummaryLog = ({
  title,
  runs,
  isLoading,
  cardId,
}: NotificationRunSummaryLogProps) => {
  const viewAllUrl = Urls.adminToolsTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
  });

  const renderRuns = () => {
    if (isLoading) {
      return (
        <Flex align="center" justify="center" py="lg">
          <Loader size="sm" />
        </Flex>
      );
    }
    if (runs && runs.length === 0) {
      return (
        <DetailsRow
          label={t`No runs in the past 90 days.`}
          value=""
          bold={false}
          spanLabel
        />
      );
    }
    return runs?.map((run, index) => {
      const isFailing = run.status === "failing";
      return (
        <Flex
          key={index}
          align="center"
          justify="space-between"
          px="md"
          py="sm"
          gap="sm"
        >
          <Text size="md" c="text-primary">
            {formatRelativeDate(run.at)}
          </Text>
          <Tooltip label={run.error} disabled={!isFailing || !run.error}>
            <Badge
              color={isFailing ? "error" : undefined}
              variant={isFailing ? "light" : "outline"}
              radius="lg"
              tt="none"
              fw="normal"
              c={isFailing ? undefined : "text-secondary"}
              bd={isFailing ? undefined : "1px solid var(--mb-color-border)"}
            >
              {isFailing ? t`Failed` : t`Successful`}
            </Badge>
          </Tooltip>
        </Flex>
      );
    });
  };

  return (
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
      <DetailsTable>{renderRuns()}</DetailsTable>
    </SidebarSection>
  );
};

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
