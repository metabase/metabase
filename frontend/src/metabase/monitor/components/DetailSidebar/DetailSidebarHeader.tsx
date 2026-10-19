import { t } from "ttag";

import { ActionIcon, Flex, Group, Icon } from "metabase/ui";

import { SidebarNavButton } from "./SidebarNavButton";
import type { DetailSidebarHeaderProps } from "./types";
import { useCopyDetailLink } from "./use-copy-detail-link";

export function DetailSidebarHeader<TId>({
  prevId,
  nextId,
  previousLabel,
  nextLabel,
  detailPath,
  onNavigate,
  onClose,
}: DetailSidebarHeaderProps<TId>) {
  const handleCopyLink = useCopyDetailLink(detailPath);

  return (
    <Flex justify="space-between" align="center">
      <Group gap="sm">
        <SidebarNavButton
          direction="previous"
          label={previousLabel}
          disabled={prevId === undefined}
          onClick={() => prevId !== undefined && onNavigate(prevId)}
        />
        <SidebarNavButton
          direction="next"
          label={nextLabel}
          disabled={nextId === undefined}
          onClick={() => nextId !== undefined && onNavigate(nextId)}
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
}
