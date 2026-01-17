import type { SortingState } from "@tanstack/react-table";
import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import type {
  DependencyNode,
  DependencySortColumn,
  DependencySortingOptions,
} from "metabase-types/api";

import {
  getDependentErrorNodesCount,
  getNodeLabel,
  getNodeLocationInfo,
} from "../../../utils";
import type { DependencyListMode } from "../types";

import { ErrorsCell } from "./ErrorsCell";
import { LocationCell } from "./LocationCell";
import { NameCell } from "./NameCell";

function getNameColumn(
  mode: DependencyListMode,
): TreeTableColumnDef<DependencyNode> {
  return {
    id: "name",
    header: mode === "broken" ? t`Dependency` : t`Name`,
    minWidth: 100,
    enableSorting: true,
    accessorFn: (node) => getNodeLabel(node),
    cell: ({ row }) => {
      const node = row.original;
      return <NameCell node={node} />;
    },
  };
}

function getLocationColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "location",
    header: t`Location`,
    minWidth: 100,
    enableSorting: true,
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

function getDependentsErrorsColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "dependents-errors",
    header: t`Problems`,
    minWidth: 100,
    enableSorting: false,
    accessorFn: (node) => node.dependents_errors?.length ?? 0,
    cell: ({ row }) => {
      const node = row.original;
      const errors = node.dependents_errors ?? [];
      if (errors.length === 0) {
        return null;
      }
      return <ErrorsCell node={node} />;
    },
  };
}

function getBrokenDependentsColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "dependents-count",
    header: t`Broken dependents`,
    minWidth: 100,
    enableSorting: true,
    accessorFn: (node) =>
      getDependentErrorNodesCount(node.dependents_errors ?? []),
    cell: ({ row }) => {
      const node = row.original;
      return getDependentErrorNodesCount(node.dependents_errors ?? []);
    },
  };
}

export function getColumns(
  mode: DependencyListMode,
): TreeTableColumnDef<DependencyNode>[] {
  return [
    getNameColumn(mode),
    getLocationColumn(),
    ...(mode === "broken" ? [getDependentsErrorsColumn()] : []),
    ...(mode === "broken" ? [getBrokenDependentsColumn()] : []),
  ];
}

export function getColumnWidths(mode: DependencyListMode): number[] {
  if (mode === "broken") {
    return [0.3, 0.3, 0.3, 0.1];
  } else {
    return [0.5, 0.5];
  }
}

export function getSortingState(
  sorting: DependencySortingOptions | undefined,
): SortingState {
  return sorting != null
    ? [{ id: sorting.column, desc: sorting.direction === "desc" }]
    : [];
}

export function getSortingOptions(
  sortingState: SortingState,
): DependencySortingOptions | undefined {
  if (sortingState.length === 0) {
    return undefined;
  }
  const { id, desc } = sortingState[0];
  return {
    column: id as DependencySortColumn,
    direction: desc ? "desc" : "asc",
  };
}

export function getNotFoundMessage(mode: DependencyListMode) {
  return mode === "broken"
    ? t`No broken dependencies found`
    : t`No unreferenced entities found`;
}
