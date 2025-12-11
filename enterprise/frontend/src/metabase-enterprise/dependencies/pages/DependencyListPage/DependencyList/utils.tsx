import { t } from "ttag";

import { getUserName } from "metabase/lib/user";
import {
  DEPENDENCY_SORT_COLUMNS,
  type DependencySortColumn,
} from "metabase-types/api";

import {
  getNodeDependentsCount,
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

function getNodeNameColumn(): DependencyColumnOptions {
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

function getNodeLocationColumn(): DependencyColumnOptions {
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

function getNodeErrorsColumn(): DependencyColumnOptions {
  return {
    id: "errors",
    get name() {
      return t`Errors`;
    },
    accessorFn: () => null,
    cell: () => {
      return <TextCell value="" />;
    },
  };
}

function getNodeDependentsCountColumn(): DependencyColumnOptions {
  return {
    id: "dependents-count",
    get name() {
      return t`Dependents`;
    },
    accessorFn: (item) => getNodeDependentsCount(item),
    cell: ({ row }) => {
      const item = row.original;
      const value = getNodeDependentsCount(item);
      return <TextCell value={String(value)} />;
    },
  };
}

function getNodeLastEditAtColumn(): DependencyColumnOptions {
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

function getNodeLastEditByColumn(): DependencyColumnOptions {
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

type ColumnOptions = {
  withErrorsColumn?: boolean;
  withDependentsCountColumn?: boolean;
};

export function getColumns({
  withErrorsColumn,
  withDependentsCountColumn,
}: ColumnOptions): DependencyColumnOptions[] {
  return [
    getNodeNameColumn(),
    getNodeLocationColumn(),
    ...(withErrorsColumn ? [getNodeErrorsColumn()] : []),
    ...(withDependentsCountColumn ? [getNodeDependentsCountColumn()] : []),
    getNodeLastEditAtColumn(),
    getNodeLastEditByColumn(),
  ];
}

export function isSortableColumn(
  column: DependencyColumn,
): column is DependencySortColumn {
  const sortColumns: ReadonlyArray<DependencyColumn> = DEPENDENCY_SORT_COLUMNS;
  return sortColumns.includes(column);
}
