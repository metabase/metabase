import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getUserName } from "metabase/lib/user";
import type { TreeTableColumnDef } from "metabase/ui";
import type { DependencyNode, DependencySortColumn } from "metabase-types/api";

import {
  getDependentErrorNodesCount,
  getNodeLabel,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
  getNodeLocationInfo,
} from "../../utils";

import { ErrorsCell } from "./ErrorsCell";
import { LocationCell } from "./LocationCell";
import { NameCell } from "./NameCell";

export function getNameColumn(
  header: string = t`Name`,
): TreeTableColumnDef<DependencyNode> {
  return {
    id: "name" satisfies DependencySortColumn,
    header,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
    accessorFn: (node) => getNodeLabel(node),
    cell: ({ row }) => {
      const node = row.original;
      return <NameCell node={node} />;
    },
  };
}

export function getLocationColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "location" satisfies DependencySortColumn,
    header: t`Location`,
    width: "auto",
    maxAutoWidth: 520,
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

export function getDependentsErrorsColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "dependents-errors" satisfies DependencySortColumn,
    header: t`Problems`,
    width: "auto",
    maxAutoWidth: 520,
    enableSorting: true,
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

export function getDependentsWithErrorsColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "dependents-with-errors" satisfies DependencySortColumn,
    header: t`Broken dependents`,
    width: "auto",
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

export function getLastEditedByColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "last-edited-by",
    header: t`Last edited by`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (node) => getUserName(getNodeLastEditedBy(node) ?? undefined),
    cell: ({ row }) => {
      const user = getNodeLastEditedBy(row.original);
      if (user == null) {
        return null;
      }
      return <Ellipsified>{getUserName(user)}</Ellipsified>;
    },
  };
}

export function getLastEditedAtColumn(): TreeTableColumnDef<DependencyNode> {
  return {
    id: "last-edited-at",
    header: t`Last edited at`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (node) => getNodeLastEditedAt(node),
    cell: ({ row }) => {
      const timestamp = getNodeLastEditedAt(row.original);
      if (timestamp == null) {
        return null;
      }
      return <DateTime value={timestamp} unit="minute" />;
    },
  };
}
