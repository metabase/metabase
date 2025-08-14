import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Button, Icon, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { TableHeader } from "../common/TableHeader";

import { EditTableDataFilterButton } from "./EditTableDataFilterButton";

interface EditTableDataHeaderProps {
  databaseId: number;
  tableId: number;
  question?: Question;
  onQuestionChange: (newQuestion: Question) => void;
  onCreate: () => void;
}

export const EditTableDataHeader = ({
  databaseId,
  tableId,
  question,
  onQuestionChange,
  onCreate,
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
          data-testid="new-record-button"
        >{t`New record`}</Button>
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
