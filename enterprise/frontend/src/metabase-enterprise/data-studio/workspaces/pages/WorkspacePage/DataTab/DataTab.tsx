import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import type {
  WorkspaceTablesResponse,
  WorkspaceTransformItem,
  Transform,
} from "metabase-types/api";

import { useWorkspace } from "../WorkspaceProvider";

import { TableListItem } from "./TableListItem";

type DataTabProps = {
  tables: WorkspaceTablesResponse;
  workspaceTransforms: WorkspaceTransformItem[];
  dbTransforms: Transform[];
  onTransformClick?: (transform: WorkspaceTransformItem) => void;
};

export const DataTab = ({
  tables,
  workspaceTransforms,
  dbTransforms,
  onTransformClick,
}: DataTabProps) => {
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
          {tables.outputs.map((table: any, index: number) => {
            const workspaceTransform = table.workspace
              ? workspaceTransforms.find(
                  (t: any) => t.id === table.workspace?.["transform-id"],
                )
              : undefined;
            const originalTransform = workspaceTransform
              ? dbTransforms.find(
                  (t: any) => t.id === workspaceTransform.upstream_id,
                )
              : undefined;
            const hasChanges = originalTransform
              ? hasTransformEdits(originalTransform)
              : false;

            return (
              <TableListItem
                key={`output-${index}`}
                name={table.global?.table || ""}
                schema={table.global?.schema}
                icon="pivot_table"
                type="output"
                hasChanges={hasChanges}
                transform={workspaceTransform}
                onTransformClick={onTransformClick}
              />
            );
          })}
        </Stack>
        <Stack gap={0}>
          {tables.inputs.map((table, index) => (
            <TableListItem
              key={`input-${index}`}
              name={table.table || ""}
              schema={table.schema}
              icon="table"
              type="input"
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
