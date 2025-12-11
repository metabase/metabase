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

import { ErrorCell } from "./ErrorCell";
import { LinkCell } from "./LinkCell";
import { LinkListCell } from "./LinkListCell";

function getNodeNameColumn(): ColumnDef<DependencyNode> {
  return {
    id: "name",
    header: t`Name`,
    meta: {
      width: "auto",
    },
    accessorFn: (node) => getNodeLabel(node),
    cell: ({ row }) => {
      const node = row.original;
      return (
        <LinkCell
          label={getNodeLabel(node)}
          icon={getNodeIcon(node)}
          url={getNodeLink(node)?.url}
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
    accessorFn: (node) => {
      const location = getNodeLocationInfo(node);
      const links = location?.links ?? [];
      return links.map((link) => link.label).join(", ");
    },
    cell: ({ row }) => {
      const node = row.original;
      const location = getNodeLocationInfo(node);
      if (location == null) {
        return null;
      }
      return <LinkListCell links={location.links} icon={location.icon} />;
    },
  };
}

function getNodeErrorsColumn(): ColumnDef<DependencyNode> {
  return {
    id: "error",
    header: t`Errors`,
    meta: {
      width: "auto",
    },
    cell: ({ row }) => {
      const node = row.original;
      const errors = node.errors ?? [];
      if (errors.length === 0) {
        return null;
      }
      return <ErrorCell node={node} />;
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
    accessorFn: (node) => getNodeDependentsCount(node),
    cell: ({ row }) => {
      const node = row.original;
      const value = getNodeDependentsCount(node);
      if (value === 0) {
        return null;
      }
      return (
        <LinkCell
          label={String(value)}
          url={Urls.dependencyGraph({ entry: node })}
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
    accessorFn: (node) => getNodeLastEditInfo(node)?.timestamp,
    cell: ({ row }) => {
      const node = row.original;
      const value = getNodeLastEditInfo(node)?.timestamp;
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
    accessorFn: (node) => {
      const editInfo = getNodeLastEditInfo(node);
      return editInfo != null ? getUserName(editInfo) : undefined;
    },
    cell: ({ row }) => {
      const node = row.original;
      const editInfo = getNodeLastEditInfo(node);
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
    getNodeErrorsColumn(),
    ...(withDependentsCountColumn ? [getNodeDependentsCountColumn()] : []),
    getNodeLastEditAtColumn(),
    getNodeLastEditByColumn(),
  ];
}
