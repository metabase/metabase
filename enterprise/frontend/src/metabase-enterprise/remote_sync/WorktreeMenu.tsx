import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import {
  useExportChangesMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

type WorktreeMenuProps = {
  worktree: Worktree;
  hasChanges: boolean;
};

export function WorktreeMenu({ worktree, hasChanges }: WorktreeMenuProps) {
  const dispatch = useDispatch();
  const [exportChanges, { isLoading: isPushing }] = useExportChangesMutation();
  const [importChanges, { isLoading: isPulling }] = useImportChangesMutation();

  const handlePush = async () => {
    const { error } = await exportChanges({
      branch: worktree.branch,
      worktree_id: worktree.id,
      message: t`Pushed from ${worktree.branch}`,
    });
    dispatch(
      addUndo({
        message: error
          ? t`Couldn't push ${worktree.branch}`
          : t`Pushing ${worktree.branch}`,
        icon: error ? "warning" : "check",
      }),
    );
  };

  const handlePull = async () => {
    const { error } = await importChanges({
      branch: worktree.branch,
      expected_branch: worktree.branch,
      worktree_id: worktree.id,
      force: true,
    });
    dispatch(
      addUndo({
        message: error
          ? t`Couldn't pull ${worktree.branch}`
          : t`Pulling ${worktree.branch}`,
        icon: error ? "warning" : "check",
      }),
    );
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon
          aria-label={t`Branch options`}
          c="text-secondary"
          onClick={(event) => event.stopPropagation()}
          size="sm"
        >
          <Icon name="ellipsis" size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          disabled={!hasChanges || isPushing}
          leftSection={<Icon name="arrow_up" size={12} />}
          onClick={handlePush}
        >
          {t`Push changes`}
        </Menu.Item>
        <Menu.Item
          disabled={isPulling}
          leftSection={<Icon name="arrow_down" size={12} />}
          onClick={handlePull}
        >
          {t`Pull changes`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
