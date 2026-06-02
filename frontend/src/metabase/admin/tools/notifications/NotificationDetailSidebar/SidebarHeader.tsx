import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  ActionIcon,
  Flex,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { NotificationId } from "metabase-types/api";

import {
  trackAlertsManagementAlertOpened,
  trackAlertsManagementLinkCopied,
} from "../analytics";

import { ChannelAvatarStack } from "./ChannelAvatarStack";
import S from "./NotificationDetailSidebar.module.css";
import type { SidebarHeaderProps } from "./types";

export const SidebarHeader = ({
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
  const cardName = notification?.payload?.card?.name ?? t`Untitled question`;
  const dispatch = useDispatch();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${Urls.adminToolsNotificationDetail(notificationId)}`;
    await navigator.clipboard.writeText(url);
    trackAlertsManagementLinkCopied(notificationId);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  };

  const handleNavigate = (id: NotificationId | undefined) => {
    if (id !== undefined) {
      trackAlertsManagementAlertOpened(id, "sidebar_navigation");
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
