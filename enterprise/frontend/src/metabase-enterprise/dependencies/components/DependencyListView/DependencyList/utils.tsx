import type { ColumnDef } from "@tanstack/react-table";
import { t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getUserName } from "metabase/lib/user";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeDependentsCount,
  getNodeLabel,
  getNodeLastEditInfo,
  getNodeLocationInfo,
} from "../../../utils";

import { DependentsCountCell } from "./DependentsCountCell";
import { ErrorsCell } from "./ErrorsCell";
import { LocationCell } from "./LocationCell";
import { NameCell } from "./NameCell";

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
      return <NameCell node={node} />;
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
      return <LocationCell node={node} />;
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
      return <ErrorsCell node={node} />;
    },
  };
}

function getNodeDependentsCountColumn(): ColumnDef<DependencyNode> {
  return {
    id: "dependents-count",
    header: t`Dependents`,
    accessorFn: (node) => getNodeDependentsCount(node),
    cell: ({ row }) => {
      const node = row.original;
      return <DependentsCountCell node={node} />;
    },
  };
}

function getNodeLastEditAtColumn(): ColumnDef<DependencyNode> {
  return {
    id: "last-edit-at",
    header: t`Last modified at`,
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
  withErrorsColumn: boolean;
  withDependentsCountColumn: boolean;
};

export function getColumns({
  withErrorsColumn,
  withDependentsCountColumn,
}: ColumnOptions): ColumnDef<DependencyNode>[] {
  return [
    getNodeNameColumn(),
    getNodeLocationColumn(),
    ...(withErrorsColumn ? [getNodeErrorsColumn()] : []),
    ...(withDependentsCountColumn ? [getNodeDependentsCountColumn()] : []),
    getNodeLastEditAtColumn(),
    getNodeLastEditByColumn(),
  ];
}
