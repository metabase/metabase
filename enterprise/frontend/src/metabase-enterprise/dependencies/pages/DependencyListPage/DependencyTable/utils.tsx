import { t } from "ttag";

import { getUserName } from "metabase/lib/user";
import {
  DEPENDENCY_SORT_COLUMNS,
  type DependencySortColumn,
} from "metabase-types/api";

import {
  getNodeIcon,
  getNodeLabel,
  getNodeLastEditInfo,
  getNodeLink,
  getNodeLocationInfo,
} from "../../../utils";

import { DateTimeCell } from "./DateTimeCell";
import { EntityCell } from "./EntityCell";
import { LocationCell } from "./LocationCell";
import { TextCell } from "./TextCell";
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

function getItemLocationColumn(): DependencyColumnOptions {
  return {
    id: "location",
    get name() {
      return t`Location`;
    },
    accessorFn: (item) => getNodeLocationInfo(item),
    cell: ({ row }) => {
      const item = row.original;
      const location = getNodeLocationInfo(item);
      return (
        <LocationCell links={location?.links ?? []} icon={location?.icon} />
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
    headerClickable: false,
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
    headerClickable: false,
  };
}

export function getColumns(): DependencyColumnOptions[] {
  return [
    getItemNameColumn(),
    getItemLocationColumn(),
    getItemLastEditAtColumn(),
    getItemLastEditByColumn(),
  ];
}

export function isSortableColumn(
  column: DependencyColumn,
): column is DependencySortColumn {
  const sortColumns: ReadonlyArray<DependencyColumn> = DEPENDENCY_SORT_COLUMNS;
  return sortColumns.includes(column);
}
