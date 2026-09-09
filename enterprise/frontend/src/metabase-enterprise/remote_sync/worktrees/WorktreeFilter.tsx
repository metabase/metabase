import { useState } from "react";
import { t } from "ttag";

import { Icon, TextInput, type TextInputProps } from "metabase/ui";
import type { Worktree } from "metabase-types/api";

/** Below this many worktrees the list is short enough to scan, so no filter is offered. */
const FILTER_THRESHOLD = 10;

export function useWorktreeFilter(worktrees: Worktree[]) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visibleWorktrees = query
    ? worktrees.filter((worktree) =>
        worktree.branch.toLowerCase().includes(query),
      )
    : worktrees;

  return {
    filter,
    setFilter,
    isFilterable: worktrees.length > FILTER_THRESHOLD,
    visibleWorktrees,
  };
}

type WorktreeFilterInputProps = Pick<TextInputProps, "autoFocus"> & {
  value: string;
  onChange: (value: string) => void;
};

export function WorktreeFilterInput({
  value,
  onChange,
  ...inputProps
}: WorktreeFilterInputProps) {
  return (
    <TextInput
      {...inputProps}
      aria-label={t`Find a worktree`}
      placeholder={t`Find a worktree…`}
      leftSection={<Icon name="search" size={16} />}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
