import type { ColumnDef } from "@tanstack/react-table";
import { t } from "ttag";

import type { DependencyNode } from "metabase-types/api";

import {
  getNodeDependentsCount,
  getNodeLabel,
  getNodeLocationInfo,
} from "../../../utils";

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
    accessorFn: (node) => node.errors?.length ?? 0,
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
      return getNodeDependentsCount(node);
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
  ];
}
