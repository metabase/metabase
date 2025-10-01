import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import { Box, Button, Icon, Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { TableHeader } from "../common/TableHeader";

import S from "./EditTableDataContainer.module.css";
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
  const [
    areFiltersExpanded,
    { open: onExpandFilters, close: onCollapseFilters },
  ] = useDisclosure(true);

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
        <Box className={S.filtersSection}>
          <QuestionFiltersHeader
            expanded={areFiltersExpanded}
            question={question}
            updateQuestion={onQuestionChange}
          />
        </Box>
      )}
    </Stack>
  );
};
