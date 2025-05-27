import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip"; // TODO: we should not use query builder components
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components"; // TODO: we should not use query builder components
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { ActionIcon, Button, Flex, Group, Icon, Stack } from "metabase/ui";
import { TableNotificationsTrigger } from "metabase-enterprise/data_editing/alerts/TableNotificationsModals/TableNotificationsTrigger/TableNotificationsTrigger";
import type Question from "metabase-lib/v1/Question";
import type { Database, Table } from "metabase-types/api";

import { TableBreadcrumbs } from "../common/TableBreadcrumbs";

import { EditTableDataFilterButton } from "./EditTableDataFilterButton";

interface EditTableDataHeaderProps {
  database: Database;
  table: Table;
  question: Question;
  isLoading: boolean;
  isUndoLoading: boolean;
  isRedoLoading: boolean;
  selectedRowIndices: number[];
  onCreate: () => void;
  onQuestionChange: (newQuestion: Question) => void;
  refetchTableDataQuery: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRequestDeleteBulk: () => void;
}

export const EditTableDataHeader = ({
  database,
  table,
  question,
  isLoading,
  isUndoLoading,
  isRedoLoading,
  selectedRowIndices,
  onCreate,
  onQuestionChange,
  refetchTableDataQuery,
  onUndo,
  onRedo,
  onRequestDeleteBulk,
}: EditTableDataHeaderProps) => {
  const hasFilters = useMemo(
    () =>
      question.query() ? getFilterItems(question.query()).length > 0 : false,
    [question],
  );
  const [
    areFiltersExpanded,
    { open: onExpandFilters, close: onCollapseFilters },
  ] = useDisclosure(hasFilters);

  const shouldDisableActions = isUndoLoading || isRedoLoading;

  return (
    <Stack gap={0}>
      <Group
        justify="space-between"
        align="center"
        p="0.5rem 1rem 0.5rem 2rem"
        mih="4rem"
        bg="var(--mb-color-background)"
        data-testid="table-data-view-header"
      >
        <TableBreadcrumbs database={database} table={table} isEditMode />

        <Group>
          <EditTableDataFilterButton
            question={question}
            isExpanded={areFiltersExpanded}
            onExpand={onExpandFilters}
            onCollapse={onCollapseFilters}
            onQuestionChange={onQuestionChange}
          />
          <Button
            leftSection={<Icon name="add" />}
            variant="filled"
            onClick={() => onCreate()}
            disabled={shouldDisableActions}
          >{t`New record`}</Button>
          <Button
            leftSection={<Icon name="trash" />}
            variant="filled"
            color="error"
            onClick={onRequestDeleteBulk}
            disabled={shouldDisableActions || !selectedRowIndices.length}
          >{t`Delete`}</Button>
          <Flex gap="xs">
            <RunButtonWithTooltip
              iconSize={16}
              onlyIcon
              medium
              compact
              isRunning={isLoading}
              onRun={refetchTableDataQuery}
            />
            <TableNotificationsTrigger tableId={table.id} />
            <ActionIcon
              onClick={onUndo}
              size="lg"
              loading={isUndoLoading}
              disabled={shouldDisableActions}
            >
              <Icon name="undo" tooltip={t`Undo changes`} />
            </ActionIcon>
            <ActionIcon
              onClick={onRedo}
              size="lg"
              loading={isRedoLoading}
              disabled={shouldDisableActions}
            >
              <Icon name="redo" tooltip={t`Redo changes`} />
            </ActionIcon>
          </Flex>
        </Group>
      </Group>
      <QuestionFiltersHeader
        expanded={areFiltersExpanded}
        question={question}
        updateQuestion={onQuestionChange}
      />
    </Stack>
  );
};
