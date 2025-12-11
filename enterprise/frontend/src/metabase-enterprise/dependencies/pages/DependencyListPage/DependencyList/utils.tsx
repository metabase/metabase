import type { ColumnDef } from "@tanstack/react-table";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeDependentsCount,
  getNodeIcon,
  getNodeLabel,
  getNodeLastEditInfo,
  getNodeLink,
  getNodeLocationInfo,
} from "../../../utils";

import { LinkCell } from "./LinkCell";
import { LinkListCell } from "./LinkListCell";

function getNodeNameColumn(): ColumnDef<DependencyNode> {
  return {
    id: "name",
    header: t`Name`,
    meta: {
      width: "auto",
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

function getNodeLocationColumn(): ColumnDef<DependencyNode> {
  return {
    id: "location",
    header: t`Location`,
    meta: {
      width: "auto",
    },
    accessorFn: (item) => {
      const location = getNodeLocationInfo(item);
      const links = location?.links ?? [];
      return links.map((link) => link.label).join(", ");
    },
    cell: ({ row }) => {
      const item = row.original;
      const location = getNodeLocationInfo(item);
      if (location == null) {
        return null;
      }
      return <LinkListCell links={location.links} icon={location.icon} />;
    },
  };
}

function getNodeDependentsCountColumn(): ColumnDef<DependencyNode> {
  return {
    id: "dependents-count",
    header: t`Dependents`,
    meta: {
      width: "auto",
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
  };
}

function getNodeLastEditAtColumn(): ColumnDef<DependencyNode> {
  return {
    id: "last-edit-at",
    header: t`Last modified at`,
    meta: {
      width: "auto",
    },
    accessorFn: (item) => getNodeLastEditInfo(item)?.timestamp,
    cell: ({ row }) => {
      const item = row.original;
      const value = getNodeLastEditInfo(item)?.timestamp;
      if (value == null) {
        return null;
      }
      return <DateTime value={value} unit="day" />;
    },
  };
}

function getNodeLastEditByColumn(): ColumnDef<DependencyNode> {
  return {
    id: "last-edit-by",
    header: t`Last modified by`,
    meta: {
      width: "auto",
    },
    accessorFn: (item) => {
      const editInfo = getNodeLastEditInfo(item);
      return editInfo != null ? getUserName(editInfo) : undefined;
    },
    cell: ({ row }) => {
      const item = row.original;
      const editInfo = getNodeLastEditInfo(item);
      return editInfo != null ? getUserName(editInfo) : null;
    },
  };
}

type ColumnOptions = {
  withDependentsCountColumn?: boolean;
};

export function getColumns({
  withDependentsCountColumn,
}: ColumnOptions): ColumnDef<DependencyNode>[] {
  return [
    getNodeNameColumn(),
    getNodeLocationColumn(),
    ...(withDependentsCountColumn ? [getNodeDependentsCountColumn()] : []),
    getNodeLastEditAtColumn(),
    getNodeLastEditByColumn(),
  ];
}
