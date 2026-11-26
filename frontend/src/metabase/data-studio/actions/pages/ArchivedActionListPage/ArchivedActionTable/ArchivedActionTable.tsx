import type { OnChangeFn } from "@tanstack/react-table";
import { useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { TreeItem } from "metabase/data-studio/common/types";
import { TreeTable, useTreeTableInstance } from "metabase/ui";
import * as Urls from "metabase/urls";

import type { ArchivedActionRowActions } from "./types";
import { getColumns } from "./utils";

type ArchivedActionTableProps = ArchivedActionRowActions & {
  tree: TreeItem[];
  searchQuery: string;
  onSearchQueryChange: OnChangeFn<string>;
};

export function ArchivedActionTable({
  tree,
  searchQuery,
  readOnly,
  onSearchQueryChange,
  onUnarchive,
}: ArchivedActionTableProps) {
  const columns = useMemo(
    () => getColumns({ readOnly, onUnarchive }),
    [readOnly, onUnarchive],
  );

  const treeTableInstance = useTreeTableInstance({
    data: tree,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: searchQuery,
    onGlobalFilterChange: onSearchQueryChange,
    defaultExpanded: true,
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      emptyState={t`No archived actions`}
      onRowClick={(row) => {
        if (row.getCanExpand()) {
          row.toggleExpanded();
        }
      }}
      renderRowLink={(row, props) => {
        const { data } = row.original;
        return data.model === "action" ? (
          <Link to={Urls.dataStudioAction(Number(data.id))} {...props} />
        ) : (
          props.children
        );
      }}
    />
  );
}
