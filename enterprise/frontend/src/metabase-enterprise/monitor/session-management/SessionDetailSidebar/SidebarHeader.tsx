import { t } from "ttag";

import { SidebarNavButton } from "metabase/monitor/components/DetailSidebar";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, Flex, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";

import type { SidebarHeaderProps } from "./types";

export const SidebarHeader = ({
  sessionId,
  prevSessionId,
  nextSessionId,
  onNavigate,
  onClose,
}: SidebarHeaderProps) => {
  const dispatch = useDispatch();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${Urls.monitorSessionDetail(sessionId)}`;
    await navigator.clipboard.writeText(url);
    dispatch(addUndo({ message: t`Link copied to clipboard` }));
  };

  return (
    <Flex justify="space-between" align="center">
      <Group gap="sm">
        <SidebarNavButton
          direction="previous"
          label={t`Previous session`}
          disabled={prevSessionId === undefined}
          onClick={() => prevSessionId && onNavigate(prevSessionId)}
        />
        <SidebarNavButton
          direction="next"
          label={t`Next session`}
          disabled={nextSessionId === undefined}
          onClick={() => nextSessionId && onNavigate(nextSessionId)}
        />
      </Group>
      <Group gap="sm">
        <ActionIcon
          aria-label={t`Copy link to clipboard`}
          size="lg"
          c="icon-primary"
          onClick={handleCopyLink}
        >
          <Icon name="link" />
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
  );
};
