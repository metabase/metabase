import { t } from "ttag";

import { BaseCell } from "metabase/data-grid";
import * as Urls from "metabase/lib/urls";
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
import { LinkCell } from "./LinkCell";
import { LinkListCell } from "./LinkListCell";
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
        <LinkCell
          label={getNodeLabel(item)}
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
      if (location == null) {
        return <BaseCell />;
      }
      return <LinkListCell links={location.links} icon={location.icon} />;
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
      return (
        <LinkCell
          label={String(value)}
          url={Urls.dependencyGraph({ entry: item })}
        />
      );
    },
    headerClickable: false,
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
      if (value == null) {
        return <BaseCell />;
      }
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
      const editInfo = getNodeLastEditInfo(item);
      const userName = editInfo != null ? getUserName(editInfo) : undefined;
      if (userName == null) {
        return <BaseCell />;
      }
      return <TextCell value={userName} />;
    },
    headerClickable: false,
  };
}

type ColumnOptions = {
  withDependentsCountColumn?: boolean;
};

export function getColumns({
  withDependentsCountColumn,
}: ColumnOptions): DependencyColumnOptions[] {
  return [
    getNodeNameColumn(),
    getNodeLocationColumn(),
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
