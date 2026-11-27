import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { Ellipsified, Icon, type TreeTableColumnDef } from "metabase/ui";
import type { DataApp, DataAppGroup } from "metabase-types/api";

import { DataAppGroupDataAccess } from "./DataAppGroupDataAccess";
import { DataAppGroupMenu } from "./DataAppGroupMenu";

const TYPE_COLUMN_WIDTH = 80;
const ACTIONS_COLUMN_WIDTH = 48;

type ColumnsOptions = {
  app: DataApp;
  isTenantsEnabled: boolean;
};

function getNameColumn(): TreeTableColumnDef<DataAppGroup> {
  return {
    id: "name",
    accessorFn: (group) => getGroupNameLocalized(group),
    header: t`Group name`,
    minWidth: 200,
    cell: ({ row }) => (
      <Ellipsified>{getGroupNameLocalized(row.original)}</Ellipsified>
    ),
  };
}

function getMemberCountColumn(): TreeTableColumnDef<DataAppGroup> {
  return {
    id: "member_count",
    accessorKey: "member_count",
    header: t`Members`,
    minWidth: 120,
  };
}

function getDataAccessColumn(app: DataApp): TreeTableColumnDef<DataAppGroup> {
  return {
    id: "data_access",
    header: t`Data access`,
    minWidth: 200,
    cell: ({ row }) => (
      <DataAppGroupDataAccess app={app} group={row.original} />
    ),
  };
}

function getTypeColumn(): TreeTableColumnDef<DataAppGroup> {
  return {
    id: "type",
    header: t`Type`,
    width: TYPE_COLUMN_WIDTH,
    cell: ({ row }) => {
      const label = row.original.is_tenant_group
        ? t`Tenant group`
        : t`Internal group`;

      return (
        <Icon
          name={row.original.is_tenant_group ? "globe" : "group"}
          aria-label={label}
          tooltip={label}
          c="text-secondary"
        />
      );
    },
  };
}

function getActionsColumn(app: DataApp): TreeTableColumnDef<DataAppGroup> {
  return {
    id: "actions",
    header: "",
    width: ACTIONS_COLUMN_WIDTH,
    cell: ({ row }) => <DataAppGroupMenu app={app} group={row.original} />,
  };
}

export function getColumns({
  app,
  isTenantsEnabled,
}: ColumnsOptions): TreeTableColumnDef<DataAppGroup>[] {
  return [
    getNameColumn(),
    getMemberCountColumn(),
    getDataAccessColumn(app),
    ...(isTenantsEnabled ? [getTypeColumn()] : []),
    getActionsColumn(app),
  ];
}
