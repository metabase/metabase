import { t } from "ttag";

import { getUserName } from "metabase/lib/user";
import type { DependencySortColumn } from "metabase-types/api";

import { DateTimeCell } from "../../../components/DependencyList/DateTimeCell";
import { EntityCell } from "../../../components/DependencyList/EntityCell";
import { TextCell } from "../../../components/DependencyList/TextCell";
import {
  getNodeIcon,
  getNodeLabel,
  getNodeLastEditInfo,
  getNodeLink,
} from "../../../utils";

import type { DependencyColumn, DependencyColumnOptions } from "./types";

function getItemNameColumn(): DependencyColumnOptions {
  return {
    id: "name",
    get name() {
      return t`Name`;
    },
    accessorFn: (item) => getNodeLabel(item),
    cell: ({ row }) => {
      const item = row.original;
      return (
        <EntityCell
          name={getNodeLabel(item)}
          icon={getNodeIcon(item)}
          url={getNodeLink(item)?.url}
        />
      );
    },
  };
}

function getItemLastEditAtColumn(): DependencyColumnOptions {
  return {
    id: "last-edit-at",
    get name() {
      return t`Last modified at`;
    },
    accessorFn: (item) => getNodeLastEditInfo(item)?.timestamp,
    cell: ({ row }) => {
      const item = row.original;
      const value = getNodeLastEditInfo(item)?.timestamp;
      return <DateTimeCell value={value} unit="day" />;
    },
  };
}

function getItemLastEditByColumn(): DependencyColumnOptions {
  return {
    id: "last-edit-by",
    get name() {
      return t`Last modified by`;
    },
    accessorFn: (item) => getNodeLastEditInfo(item),
    cell: ({ row }) => {
      const item = row.original;
      const value = getNodeLastEditInfo(item);
      return <TextCell value={value ? getUserName(value) : undefined} />;
    },
  };
}

export function getColumns(): DependencyColumnOptions[] {
  return [
    getItemNameColumn(),
    getItemLastEditAtColumn(),
    getItemLastEditByColumn(),
  ];
}

export function isSortableColumn(
  column: DependencyColumn,
): column is DependencySortColumn {
  return column === "name";
}
