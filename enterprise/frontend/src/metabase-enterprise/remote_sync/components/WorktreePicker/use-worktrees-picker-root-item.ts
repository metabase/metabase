import { useMemo } from "react";

import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
} from "metabase/common/components/Pickers";

import { useWorktrees } from "../../hooks/use-worktrees";

import { worktreesPickerRootItem } from "./picker-items";

/**
 * The picker's top-level "Worktrees" folder. Only offered where the caller opted in
 * (`options.hasWorktrees` — new-content pickers, since content can't move into a worktree),
 * to admins, with remote sync on, and when at least one worktree exists.
 */
export const useWorktreesPickerRootItem = (
  options: EntityPickerOptions,
): OmniPickerCollectionItem | null => {
  const { worktrees, isEnabled } = useWorktrees({
    skip: !options.hasWorktrees,
  });
  const hasWorktrees = worktrees.length > 0;

  return useMemo(
    () => (isEnabled && hasWorktrees ? worktreesPickerRootItem() : null),
    [isEnabled, hasWorktrees],
  );
};
