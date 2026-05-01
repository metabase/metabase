import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { WorkspaceAccessKey } from "metabase-types/api";

import { AccessKeyMenu } from "../AccessKeyMenu";

export function getNameColumn(): TreeTableColumnDef<WorkspaceAccessKey> {
  return {
    id: "name",
    header: t`Name`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.name,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getCreatedByColumn(): TreeTableColumnDef<WorkspaceAccessKey> {
  return {
    id: "created_by",
    header: t`Created by`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.creator?.common_name ?? row.creator?.email ?? "",
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getCreatedAtColumn(): TreeTableColumnDef<WorkspaceAccessKey> {
  return {
    id: "created_at",
    header: t`Created at`,
    minWidth: 200,
    accessorFn: (row) => row.created_at,
    cell: ({ getValue }) => <DateTime value={String(getValue())} />,
  };
}

export function getMenuColumn(
  onEdit: (accessKey: WorkspaceAccessKey) => void,
  onDelete: (accessKey: WorkspaceAccessKey) => void,
): TreeTableColumnDef<WorkspaceAccessKey> {
  return {
    id: "actions",
    header: "",
    width: "auto",
    cell: ({ row }) => (
      <AccessKeyMenu
        accessKey={row.original}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
  };
}

export function getColumns(
  onEdit: (accessKey: WorkspaceAccessKey) => void,
  onDelete: (accessKey: WorkspaceAccessKey) => void,
): TreeTableColumnDef<WorkspaceAccessKey>[] {
  return [
    getNameColumn(),
    getCreatedByColumn(),
    getCreatedAtColumn(),
    getMenuColumn(onEdit, onDelete),
  ];
}
