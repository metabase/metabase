import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import { Ellipsified } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

import { getDataAppStatusLabel } from "../../../../utils";
import { DataAppMoreMenu } from "../../../components/DataAppMoreMenu";

import type { DataAppRow } from "./types";

const ACTIONS_COLUMN_WIDTH = 48;

export function getRows(apps: DataApp[]): DataAppRow[] {
  return apps.map((app) => ({
    ...app,
    address: Urls.dataApp(app.slug),
    statusLabel: getDataAppStatusLabel(app),
  }));
}

function getNameColumn(): TreeTableColumnDef<DataAppRow> {
  return {
    id: "name",
    accessorKey: "name",
    header: t`Name`,
    minWidth: 160,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

function getAddressColumn(): TreeTableColumnDef<DataAppRow> {
  return {
    id: "address",
    accessorKey: "address",
    header: t`Address`,
    minWidth: 160,
    cell: ({ row }) => <Ellipsified>{row.original.address}</Ellipsified>,
  };
}

function getStatusColumn(): TreeTableColumnDef<DataAppRow> {
  return {
    id: "status",
    accessorKey: "statusLabel",
    header: t`Status`,
    minWidth: 120,
    cell: ({ row }) => row.original.statusLabel,
  };
}

function getUpdatedAtColumn(): TreeTableColumnDef<DataAppRow> {
  return {
    id: "updated_at",
    accessorKey: "updated_at",
    header: t`Last synced`,
    minWidth: 160,
    cell: ({ row }) => <DateTime value={row.original.updated_at} />,
  };
}

function getActionsColumn(): TreeTableColumnDef<DataAppRow> {
  return {
    id: "actions",
    header: "",
    width: ACTIONS_COLUMN_WIDTH,
    cell: ({ row }) => <DataAppMoreMenu app={row.original} />,
  };
}

export function getColumns(): TreeTableColumnDef<DataAppRow>[] {
  return [
    getNameColumn(),
    getAddressColumn(),
    getStatusColumn(),
    getUpdatedAtColumn(),
    getActionsColumn(),
  ];
}
