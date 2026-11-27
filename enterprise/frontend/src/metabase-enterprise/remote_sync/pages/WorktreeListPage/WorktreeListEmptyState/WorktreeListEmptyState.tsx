import { t } from "ttag";

import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { Button, Flex } from "metabase/ui";

type WorktreeListEmptyStateProps = {
  onCreate: () => void;
};

export function WorktreeListEmptyState({
  onCreate,
}: WorktreeListEmptyStateProps) {
  return (
    <FeatureEmptyState
      title={t`Work on a branch without touching the main one`}
      description={t`A worktree checks out a branch of your repository next to the main one. Make changes there, push them, and merge them when they’re ready.`}
      actions={
        <Flex>
          <Button variant="filled" onClick={onCreate}>
            {t`Create a worktree`}
          </Button>
        </Flex>
      }
      features={[
        {
          icon: "git_branch",
          title: t`Any branch`,
          description: t`Check out an existing branch or create a new one`,
        },
        {
          icon: "lock",
          title: t`Isolated`,
          description: t`Changes stay in the worktree until you push them`,
        },
        {
          icon: "arrow_down",
          title: t`Pull and push`,
          description: t`Sync the worktree with its branch like the main one`,
        },
        {
          icon: "person",
          title: t`Shared`,
          description: t`Several users can work in the same worktree`,
        },
      ]}
    />
  );
}
