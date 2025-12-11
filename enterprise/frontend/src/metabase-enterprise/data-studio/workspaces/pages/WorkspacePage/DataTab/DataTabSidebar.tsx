import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import type {
  TableId,
  Transform,
  WorkspaceTablesResponse,
  WorkspaceTransformItem,
} from "metabase-types/api";

import { type OpenTable, useWorkspace } from "../WorkspaceProvider";

import { TableListItem } from "./TableListItem";

type DataTabSidebarProps = {
  tables: WorkspaceTablesResponse;
  workspaceTransforms: WorkspaceTransformItem[];
  dbTransforms: Transform[];
  selectedTableId?: TableId | null;
  onTransformClick?: (transform: WorkspaceTransformItem) => void;
  onTableSelect?: (table: OpenTable) => void;
};

export const DataTabSidebar = ({
  tables,
  workspaceTransforms,
  dbTransforms,
  selectedTableId,
  onTransformClick,
  onTableSelect,
}: DataTabSidebarProps) => {
  const { hasTransformEdits } = useWorkspace();
  return (
    <Stack h="100%" gap="sm">
      <Stack
        gap="xs"
        pb="sm"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Text fw={600}>{t`Data active in this workspace`}</Text>
        <Stack gap={0}>
          {tables.outputs.map((table, index: number) => {
            const workspaceTransform = workspaceTransforms.find(
              (t) => t["ref_id"] === table.isolated.transform_id,
            );
            const originalTransform = workspaceTransform?.global_id
              ? dbTransforms.find((t) => t.id === workspaceTransform.global_id)
              : undefined;
            const hasChanges = originalTransform
              ? hasTransformEdits(originalTransform)
              : false;
            const tableId = table.isolated.id;

            return (
              <TableListItem
                key={`output-${index}`}
                name={table.isolated.table}
                schema={table.isolated.schema}
                icon="pivot_table"
                type="output"
                hasChanges={hasChanges}
                transform={workspaceTransform}
                tableId={tableId ?? undefined}
                isSelected={tableId === selectedTableId}
                onTransformClick={onTransformClick}
                onTableClick={onTableSelect}
              />
            );
          })}
        </Stack>
        <Stack gap={0}>
          {tables.inputs.map((table, index) => (
            <TableListItem
              key={`input-${index}`}
              name={table.table}
              schema={table.schema}
              icon="table"
              type="input"
              tableId={table.table_id ?? undefined}
              onTransformClick={onTransformClick}
              onTableClick={onTableSelect}
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
