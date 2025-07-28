import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { ActionIcon, Button, Flex, Icon, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { TableHeader } from "../common/TableHeader";

import { EditTableDataFilterButton } from "./EditTableDataFilterButton";

interface EditTableDataHeaderProps {
  databaseId: number;
  tableId: number;
  question?: Question;
  isUndoLoading: boolean;
  isRedoLoading: boolean;
  onQuestionChange: (newQuestion: Question) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreate: () => void;
  onRequestDeleteBulk: () => void;
  canDeleteBulk: boolean;
}

export const EditTableDataHeader = ({
  databaseId,
  tableId,
  question,
  isUndoLoading,
  isRedoLoading,
  onQuestionChange,
  onUndo,
  onRedo,
  onCreate,
  onRequestDeleteBulk,
  canDeleteBulk,
}: EditTableDataHeaderProps) => {
  const hasFilters = useMemo(
    () =>
      question?.query() ? getFilterItems(question.query()).length > 0 : false,
    [question],
  );

  const [
    areFiltersExpanded,
    { open: onExpandFilters, close: onCollapseFilters },
  ] = useDisclosure(hasFilters);

  const shouldDisableActions = isUndoLoading || isRedoLoading;

  return (
    <Stack gap={0}>
      <TableHeader databaseId={databaseId} tableId={tableId} showEditBreadcrumb>
        {question && (
          <EditTableDataFilterButton
            question={question}
            isExpanded={areFiltersExpanded}
            onExpand={onExpandFilters}
            onCollapse={onCollapseFilters}
            onQuestionChange={onQuestionChange}
          />
        )}

        <Button
          leftSection={<Icon name="add" />}
          variant="filled"
          onClick={onCreate}
          disabled={shouldDisableActions}
        >{t`New record`}</Button>

        <Button
          leftSection={<Icon name="trash" />}
          variant="filled"
          color="error"
          onClick={onRequestDeleteBulk}
          disabled={shouldDisableActions || !canDeleteBulk}
        >{t`Delete`}</Button>

        <Flex gap="xs">
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
      </TableHeader>
      {question && (
        <QuestionFiltersHeader
          expanded={areFiltersExpanded}
          question={question}
          updateQuestion={onQuestionChange}
        />
      )}
    </Stack>
  );
};
