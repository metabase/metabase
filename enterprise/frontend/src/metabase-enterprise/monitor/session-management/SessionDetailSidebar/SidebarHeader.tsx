import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  ActionIcon,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import { getSessionUserName } from "../utils";

import S from "./SessionDetailSidebar.module.css";
import type { SidebarHeaderProps } from "./types";

export const SidebarHeader = ({
  sessionId,
  session,
  prevSessionId,
  nextSessionId,
  isRevoking,
  onNavigate,
  onRevokeSession,
  onRevokeUserSessions,
  onClose,
}: SidebarHeaderProps) => {
  const dispatch = useDispatch();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${Urls.monitorSessionDetail(sessionId)}`;
    await navigator.clipboard.writeText(url);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  };

  return (
    <Stack gap="xl">
      <Flex justify="space-between" align="center">
        <Group gap="sm">
          <ActionIcon
            aria-label={t`Previous session`}
            size="lg"
            variant="default"
            className={S.navButton}
            disabled={prevSessionId === undefined}
            onClick={() => prevSessionId && onNavigate(prevSessionId)}
          >
            <Icon name="chevronup" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Next session`}
            size="lg"
            variant="default"
            className={S.navButton}
            disabled={nextSessionId === undefined}
            onClick={() => nextSessionId && onNavigate(nextSessionId)}
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
                disabled={isRevoking}
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
              {session && !session.current && (
                <Menu.Item
                  c="feedback-negative"
                  leftSection={<Icon name="exit" />}
                  onClick={() => onRevokeSession(session)}
                >
                  {t`Revoke session`}
                </Menu.Item>
              )}
              {session && (
                <Menu.Item
                  c="feedback-negative"
                  leftSection={<Icon name="exit" />}
                  onClick={() => onRevokeUserSessions(session)}
                >
                  {t`Revoke all sessions for ${getSessionUserName(session.user)}`}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
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

      {session && (
        <Stack gap={0}>
          <Text size="sm" c="text-secondary">
            {t`Session`}
          </Text>
          <Title order={3} c="text-primary">
            {getSessionUserName(session.user)}
          </Title>
        </Stack>
      )}
    </Stack>
  );
};
