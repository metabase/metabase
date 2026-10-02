import { t } from "ttag";

import {
  SidebarNavButton,
  useCopyDetailLink,
} from "metabase/monitor/components/DetailSidebar";
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
  const handleCopyLink = useCopyDetailLink(
    Urls.monitorSessionDetail(sessionId),
  );

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
          variant="subtle"
          aria-label={t`Copy link to clipboard`}
          size="lg"
          onClick={handleCopyLink}
        >
          <Icon name="link" />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          aria-label={t`Close`}
          size="lg"
          onClick={onClose}
        >
          <Icon name="close" />
        </ActionIcon>
      </Group>
    </Flex>
  );
};
