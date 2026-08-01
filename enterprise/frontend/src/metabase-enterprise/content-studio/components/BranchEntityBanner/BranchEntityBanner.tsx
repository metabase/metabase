import { match } from "ts-pattern";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type {
  BranchEntityBannerProps,
  BranchEntityType,
} from "metabase/plugins";
import { Box, Flex, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";

function getMessage(entityType: BranchEntityType, branch: string) {
  return match(entityType)
    .with("dashboard", () => t`This dashboard is on the ${branch} branch.`)
    .with("document", () => t`This document is on the ${branch} branch.`)
    .exhaustive();
}

/** @see PLUGIN_CONTENT_STUDIO.BranchEntityBanner */
export function BranchEntityBanner({
  entityType,
  worktreeId,
  collectionId,
}: BranchEntityBannerProps) {
  const { worktrees } = useWorktrees();
  const worktree = worktrees.find(({ id }) => id === worktreeId);

  if (worktree == null) {
    return null;
  }

  const studioUrl =
    collectionId != null
      ? Urls.contentStudioCollection(collectionId)
      : Urls.contentStudioCollections({ worktreeId });

  return (
    <Box
      px="1.5rem"
      py="0.75rem"
      w="100%"
      bg="background-info"
      data-testid="branch-entity-banner"
    >
      <Flex align="center" justify="space-between" gap="md">
        <Flex align="center" gap="sm">
          <Icon name="git_branch" c="text-secondary" />
          <Text size="md" lh="1rem">
            {getMessage(entityType, worktree.branch)}
          </Text>
        </Flex>
        <Text
          component={Link}
          to={studioUrl}
          size="md"
          lh="1rem"
          fw="bold"
          c="text-brand"
        >
          {t`Open in Content Studio`}
        </Text>
      </Flex>
    </Box>
  );
}
