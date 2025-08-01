import { t } from "ttag";

import { Box, Flex, Tooltip } from "metabase/ui/components";
import { ActionIcon } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";

interface TableDetailViewContentHeaderProps {
  onViewNextObjectDetail: () => void;
  onViewPreviousObjectDetail: () => void;
  onCopyLink: () => void;
  onEditClick: () => void;
  linkCopied: boolean;
  canOpenPreviousItem: boolean;
  canOpenNextItem: boolean;
}

export function TableDetailViewContentHeader({
  onViewNextObjectDetail,
  onViewPreviousObjectDetail,
  onCopyLink,
  onEditClick,
  canOpenPreviousItem,
  canOpenNextItem,
  linkCopied,
}: TableDetailViewContentHeaderProps) {
  return (
    <Flex
      justify="space-between"
      align="center"
      mb="sm"
      px="lg"
      data-testid="content-header"
    >
      <Flex gap="md">
        <Tooltip label={t`Previous row`}>
          <ActionIcon
            onClick={onViewPreviousObjectDetail}
            variant="subtle"
            c="var(--mb-text-primary)"
            size="14"
            disabled={!canOpenPreviousItem}
          >
            <Icon name="chevronup" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Next row`}>
          <ActionIcon
            onClick={onViewNextObjectDetail}
            variant="subtle"
            c="var(--mb-text-primary)"
            size="14"
            disabled={!canOpenNextItem}
          >
            <Icon name="chevrondown" />
          </ActionIcon>
        </Tooltip>
      </Flex>
      <Box>
        <Tooltip label={linkCopied ? t`Copied!` : t`Copy link to a row`}>
          <ActionIcon
            onClick={onCopyLink}
            variant="subtle"
            c="var(--mb-text-primary)"
          >
            <Icon name="link" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Edit layout`}>
          <ActionIcon
            onClick={onEditClick}
            variant="subtle"
            c="var(--mb-text-primary)"
          >
            <Icon name="pencil" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`More options`}>
          <ActionIcon
            onClick={() => {
              // TODO: Implement more options menu
            }}
            variant="subtle"
            c="var(--mb-text-primary)"
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Tooltip>
      </Box>
    </Flex>
  );
}
