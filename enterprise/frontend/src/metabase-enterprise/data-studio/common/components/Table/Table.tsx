import type { TreeColumnDef, TreeNodeData } from "metabase/ui";
import { TreeTable, useTreeTable } from "metabase/ui";

export interface TableProps<T extends TreeNodeData & { children?: T[] }> {
  data: T[];
  columns: TreeColumnDef<T>[];
  onSelect: (item: T) => void;
}

export function Table<T extends TreeNodeData & { children?: T[] }>({
  data,
  columns,
  onSelect,
}: TableProps<T>) {
  const instance = useTreeTable({
    data,
    columns,
    getChildren: (node) => node.children,
    getNodeId: (node) => node.id,
  });

  return (
    <TreeTable
      instance={instance}
      onRowClick={(node) => {
        if (node.hasChildren) {
          instance.expansion.toggle(node.id);
        } else {
          onSelect(node.data);
        }
      }}
    />
  );
}

export const TableComponent = Table;
