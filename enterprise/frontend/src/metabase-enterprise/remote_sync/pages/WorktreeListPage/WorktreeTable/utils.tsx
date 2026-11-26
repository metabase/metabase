import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified, FixedSizeIcon, Flex } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import { CheckoutBadge } from "../CheckoutBadge";

import { WorktreeRowMenu } from "./WorktreeRowMenu";
import type { WorktreeRow, WorktreeRowActions } from "./types";

const ACTIONS_COLUMN_WIDTH = 48;

export function getRows(
  worktrees: RemoteSyncWorktree[],
  currentWorktreeId: RemoteSyncWorktreeId | null,
): WorktreeRow[] {
  return worktrees.map((worktree) => ({
    ...worktree,
    isCheckedOut: worktree.id === currentWorktreeId,
    createdBy: getUserName(worktree.creator ?? undefined) ?? "",
    checkedOutBy: (worktree.users ?? [])
      .map((user) => getUserName(user))
      .join(", "),
  }));
}

function getBranchColumn(): TreeTableColumnDef<WorktreeRow> {
  return {
    id: "branch",
    accessorKey: "branch",
    header: t`Branch`,
    enableSorting: true,
    minWidth: 200,
    cell: ({ row }) => (
      <Flex align="center" gap="sm" miw={0}>
        <FixedSizeIcon name="git_branch" />
        <Ellipsified>{row.original.branch}</Ellipsified>
        {row.original.isCheckedOut && <CheckoutBadge />}
      </Flex>
    ),
  };
}

function getCreatedByColumn(): TreeTableColumnDef<WorktreeRow> {
  return {
    id: "created-by",
    accessorKey: "createdBy",
    header: t`Created by`,
    enableSorting: true,
    minWidth: 120,
    cell: ({ row }) => <Ellipsified>{row.original.createdBy}</Ellipsified>,
  };
}

function getCreatedAtColumn(): TreeTableColumnDef<WorktreeRow> {
  return {
    id: "created-at",
    accessorKey: "created_at",
    header: t`Created at`,
    enableSorting: true,
    minWidth: 150,
    cell: ({ row }) => <DateTime value={row.original.created_at} unit="day" />,
  };
}

function getCheckedOutByColumn(): TreeTableColumnDef<WorktreeRow> {
  return {
    id: "checked-out-by",
    accessorKey: "checkedOutBy",
    header: t`Checked out by`,
    enableSorting: true,
    minWidth: 160,
    cell: ({ row }) => <Ellipsified>{row.original.checkedOutBy}</Ellipsified>,
  };
}

function getActionsColumn(
  actions: WorktreeRowActions,
): TreeTableColumnDef<WorktreeRow> {
  return {
    id: "actions",
    header: "",
    width: ACTIONS_COLUMN_WIDTH,
    cell: ({ row }) => (
      <WorktreeRowMenu
        worktree={row.original}
        onCheckout={actions.onCheckout}
        onDelete={actions.onDelete}
      />
    ),
  };
}

export function getColumns(
  actions: WorktreeRowActions,
): TreeTableColumnDef<WorktreeRow>[] {
  return [
    getBranchColumn(),
    getCreatedByColumn(),
    getCreatedAtColumn(),
    getCheckedOutByColumn(),
    getActionsColumn(actions),
  ];
}
