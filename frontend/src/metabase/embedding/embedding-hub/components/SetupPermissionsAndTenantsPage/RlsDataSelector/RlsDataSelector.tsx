import { useCallback, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button, Flex, Icon, Stack, Text, UnstyledButton } from "metabase/ui";
import type { FieldId, TableId } from "metabase-types/api";

import { useUpsertGroupTableAccessPolicies } from "../hooks/use-upsert-group-table-access-policies";

import S from "./RlsDataSelector.module.css";
import { TableColumnCard } from "./TableColumnCard";

export interface TableColumnSelection {
  tableId: TableId | null;
  columnId: FieldId | null;
  /** Resolved by TableColumnCard once table metadata is loaded */
  tableName?: string | null;
  columnName?: string | null;
}

export interface RlsSelectionResult {
  fieldIds: FieldId[];
  tableNames: string[];
  columnName: string | null;
}

interface RlsDataSelectorProps {
  onSuccess: (result: RlsSelectionResult) => void;
}

export const RlsDataSelector = ({ onSuccess }: RlsDataSelectorProps) => {
  const [sendToast] = useToast();

  const [selections, setSelections] = useState<TableColumnSelection[]>([
    { tableId: null, columnId: null },
  ]);

  const { handleUpsertPolicies, isCreatingPolicy, isLoadingPolicies } =
    useUpsertGroupTableAccessPolicies({ tableColumnSelections: selections });

  const handleSubmit = useCallback(async () => {
    try {
      await handleUpsertPolicies();
      onSuccess({
        fieldIds: selections
          .map((s) => s.columnId)
          .filter((id): id is FieldId => id != null),

        tableNames: selections
          .map((s) => s.tableName)
          .filter((name): name is string => name != null),

        // We use the first selection's column name for the summary description.
        // In practice, all tables in an RLS setup share the same tenant
        // identifier column (e.g. tenant_id).
        columnName: selections[0]?.columnName ?? null,
      });
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(
          error,
          t`Failed to configure row-level security`,
        ),
      });
    }
  }, [handleUpsertPolicies, selections, onSuccess, sendToast]);

  const addTable = useCallback(() => {
    setSelections((prev) => [...prev, { tableId: null, columnId: null }]);
  }, []);

  const removeTable = useCallback((nextIndex: number) => {
    setSelections((prev) =>
      prev.filter((_, prevIndex) => prevIndex !== nextIndex),
    );
  }, []);

  const updateTable = useCallback(
    (index: number, selection: TableColumnSelection) => {
      setSelections((prev) => {
        const newSelections = [...prev];
        newSelections[index] = selection;

        return newSelections;
      });
    },
    [],
  );

  const canRemove = selections.length > 1;

  const isAllTableAndColumnChosen = selections.every(
    (selection) => selection.tableId !== null && selection.columnId !== null,
  );

  return (
    <Stack gap="md">
      <Text size="md" c="text-secondary" lh="lg">
        {t`Select one or more tables to be made visible to tenant users, and the column to filter by. Only rows where the value in the selected column matches the organization_id attribute will be visible to tenant users. You will create tenants and configure this attribute in the next step.`}
      </Text>

      <Text size="md" c="text-secondary" lh="lg">
        {t`Tenant users will be able to create queries on these tables with the query builder. All other tables will be blocked.`}
      </Text>

      <Stack gap="md">
        {selections.map((selection, index) => {
          // Get all selected table ids, except the current card's selection
          const selectedTableIds = selections
            .filter((_, filterIndex) => filterIndex !== index)
            .map((selection) => selection.tableId)
            .filter((tableId) => tableId !== null);

          return (
            <TableColumnCard
              key={index}
              selection={selection}
              onChange={(nextSelection) => updateTable(index, nextSelection)}
              onRemove={canRemove ? () => removeTable(index) : undefined}
              selectedTableIds={selectedTableIds}
            />
          );
        })}
      </Stack>

      <Flex justify="space-between" align="center">
        <UnstyledButton onClick={addTable} className={S.AddTableButton}>
          <Flex align="center" gap="xs">
            <Icon name="add" size={16} />
            <Text fw="bold" size="md" c="inherit">{t`Add table`}</Text>
          </Flex>
        </UnstyledButton>

        <Button
          variant="filled"
          disabled={!isAllTableAndColumnChosen || isLoadingPolicies}
          onClick={handleSubmit}
          loading={isCreatingPolicy}
        >{t`Next`}</Button>
      </Flex>
    </Stack>
  );
};
