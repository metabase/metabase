import type { MouseEvent } from "react";
import { t } from "ttag";

import { MoreMenuButton } from "metabase/common/data-studio/components/MoreMenuButton";
import { FixedSizeIcon, Menu } from "metabase/ui";

import type { WorktreeRow } from "./types";

type WorktreeRowMenuProps = {
  worktree: WorktreeRow;
  onCheckout: (worktree: WorktreeRow) => void;
  onDelete: (worktree: WorktreeRow) => void;
};

export function WorktreeRowMenu({
  worktree,
  onCheckout,
  onDelete,
}: WorktreeRowMenuProps) {
  const handleTargetClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <MoreMenuButton
          aria-label={t`Worktree options`}
          onClick={handleTargetClick}
        />
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item
          leftSection={<FixedSizeIcon name="git_branch" />}
          disabled={worktree.isCheckedOut}
          onClick={() => onCheckout(worktree)}
        >
          {t`Check out`}
        </Menu.Item>
        <Menu.Item
          leftSection={<FixedSizeIcon name="trash" />}
          c="feedback-negative"
          onClick={() => onDelete(worktree)}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
