import { useMemo } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Stack, Text } from "metabase/ui";
import {
  DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
  useGetWorkspaceTablesQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type {
  DatabaseId,
  TableId,
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import { type OpenTable, useWorkspace } from "../WorkspaceProvider";

import { TableListItem, TableListItemSkeleton } from "./TableListItem";

type DataTabSidebarProps = {
  databaseId?: DatabaseId | null;
  readOnly?: boolean;
  runningTransforms?: Set<string>;
  selectedTableId?: TableId | null;
  workspaceId: WorkspaceId;
  workspaceTransforms: WorkspaceTransformListItem[];
  onTransformClick?: (transform: WorkspaceTransformListItem) => void;
  onTableSelect?: (table: OpenTable) => void;
  onRunTransform?: (transform: WorkspaceTransformListItem) => void;
};

export const DataTabSidebar = ({
  databaseId,
  readOnly,
  runningTransforms,
  selectedTableId,
  workspaceId,
  workspaceTransforms,
  onTransformClick,
  onTableSelect,
  onRunTransform,
}: DataTabSidebarProps) => {
  const { hasTransformEdits } = useWorkspace();
  const {
    data: tables = DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE,
    error: tablesError,
    isLoading: isLoadingTables,
  } = useGetWorkspaceTablesQuery(workspaceId);
  const {
    data: allDbTransforms = [],
    error: allDbTransformsError,
    isLoading: isLoadingAllDbTransforms,
  } = useListTransformsQuery({});

  const dbTransforms = useMemo(
    () =>
      allDbTransforms.filter((t) => {
        if (t.source_type === "python") {
          return (
            "source-database" in t.source &&
            t.source["source-database"] === databaseId
          );
        }
        if (t.source_type === "native") {
          return "query" in t.source && t.source.query.database === databaseId;
        }
        return false;
      }),
    [allDbTransforms, databaseId],
  );

  const error = tablesError || allDbTransformsError;
  const isLoading = isLoadingTables || isLoadingAllDbTransforms;

  if (error) {
    return <Text c="error" size="sm">{t`Failed to load tables`}</Text>;
  }

  return (
    <Stack h="100%" gap="sm">
      <Stack gap="sm" pb="sm">
        <Text fw={600}>{t`Data active in this workspace`}</Text>

        {isLoading ? (
          <>
            <Stack gap="xs">
              <Text
                size="sm"
                fw={600}
                c="text-secondary"
              >{t`Output tables`}</Text>
              <Stack gap={0}>
                <TableListItemSkeleton />
                <TableListItemSkeleton />
              </Stack>
            </Stack>
            <Stack gap="xs">
              <Text
                size="sm"
                fw={600}
                c="text-secondary"
              >{t`Input tables`}</Text>
              <Stack gap={0}>
                <TableListItemSkeleton />
                <TableListItemSkeleton />
              </Stack>
            </Stack>
          </>
        ) : (
          <>
            {tables.outputs.length + tables.inputs.length === 0 && (
              <EmptyState message={t`No tables in this workspace`} />
            )}

            {tables.outputs.length > 0 && (
              <Stack gap="xs">
                <Text
                  size="sm"
                  fw={600}
                  c="text-secondary"
                >{t`Output tables`}</Text>

                <Stack gap={0}>
                  {tables.outputs.map((table, index: number) => {
                    const workspaceTransform = workspaceTransforms.find(
                      (t) => t.ref_id === table.isolated.transform_id,
                    );
                    const originalTransform = workspaceTransform?.global_id
                      ? dbTransforms.find(
                          (t) => t.id === workspaceTransform.global_id,
                        )
                      : undefined;
                    const hasChanges = originalTransform
                      ? hasTransformEdits({
                          ...originalTransform,
                          type: "transform",
                        })
                      : false;
                    const tableId = table.isolated.table_id;

                    return (
                      <TableListItem
                        key={`output-${index}`}
                        name={table.global.table}
                        schema={table.global.schema}
                        icon="pivot_table"
                        type="output"
                        hasChanges={hasChanges}
                        transform={workspaceTransform}
                        tableId={tableId ?? undefined}
                        isSelected={tableId === selectedTableId}
                        isRunning={
                          workspaceTransform
                            ? runningTransforms?.has(workspaceTransform.ref_id)
                            : false
                        }
                        onTransformClick={onTransformClick}
                        onTableClick={onTableSelect}
                        onRunTransform={onRunTransform}
                        readOnly={readOnly}
                      />
                    );
                  })}
                </Stack>
              </Stack>
            )}

            {tables.inputs.length > 0 && (
              <Stack gap="xs">
                <Text
                  size="sm"
                  fw={600}
                  c="text-secondary"
                >{t`Input tables`}</Text>

                <Stack gap={0}>
                  {tables.inputs.map((table, index) => (
                    <TableListItem
                      key={`input-${index}`}
                      name={table.table}
                      schema={table.schema}
                      icon="table"
                      type="input"
                      isSelected={table.table_id === selectedTableId}
                      tableId={table.table_id ?? undefined}
                      onTransformClick={onTransformClick}
                      onTableClick={onTableSelect}
                      readOnly={readOnly}
                    />
                  ))}
                </Stack>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};
