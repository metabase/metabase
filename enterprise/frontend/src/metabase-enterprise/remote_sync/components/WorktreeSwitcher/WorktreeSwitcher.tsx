import { useMemo } from "react";
import { t } from "ttag";

import type { WorktreeSwitcherProps } from "metabase/plugins";
import { Icon, Select } from "metabase/ui";

import { useWorktrees } from "../../hooks/use-worktrees";

const MAIN_APP_VALUE = "main-app";

/**
 * Swaps a listing between the main app's content and a worktree's checked-out
 * copy. Rendered only for admins when worktrees exist.
 */
export const WorktreeSwitcher = ({
  value,
  onChange,
}: WorktreeSwitcherProps) => {
  const { worktrees, isEnabled } = useWorktrees();

  const options = useMemo(
    () => [
      { value: MAIN_APP_VALUE, label: t`Main` },
      ...worktrees.map((worktree) => ({
        value: String(worktree.id),
        label: worktree.branch,
      })),
    ],
    [worktrees],
  );

  if (!isEnabled || worktrees.length === 0) {
    return null;
  }

  return (
    <Select
      data={options}
      value={value != null ? String(value) : MAIN_APP_VALUE}
      onChange={(newValue) =>
        onChange(
          newValue == null || newValue === MAIN_APP_VALUE
            ? null
            : Number(newValue),
        )
      }
      leftSection={<Icon name="git_branch" size={14} />}
      w="14rem"
      aria-label={t`Worktree`}
      data-testid="worktree-switcher"
    />
  );
};
