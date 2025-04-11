import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { TableNotificationsTrigger } from "metabase/notifications/modals";
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";
import { Button, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import { EditTableDataFilterButton } from "metabase-enterprise/data_editing/tables/edit/EditTableDataFilterButton";
import type Question from "metabase-lib/v1/Question";
import type { Table } from "metabase-types/api";

import { EditTableDataBackButton } from "./EditTableDataBackButton";

interface EditTableDataHeaderProps {
  table: Table;
  question: Question;
  onCreate: () => void;
  onQuestionChange: (newQuestion: Question) => void;
}

export const EditTableDataHeader = ({
  table,
  question,
  onCreate,
  onQuestionChange,
}: EditTableDataHeaderProps) => {
  const [
    areFiltersExpanded,
    { open: onExpandFilters, close: onCollapseFilters },
  ] = useDisclosure(false);

  return (
    <Stack gap={0}>
      <Flex
        p="lg"
        data-testid="table-data-view-header"
        bd="1px solid var(--mb-color-border)"
        justify="space-between"
      >
        <Group gap="sm">
          <EditTableDataBackButton table={table} />
          <Title>{t`Editing ${table.display_name}`}</Title>
        </Group>

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
            onClick={onCreate}
          >{t`New record`}</Button>
          <TableNotificationsTrigger tableId={table.id} />
        </Group>
      </Flex>
      <QuestionFiltersHeader
        expanded={areFiltersExpanded}
        question={question}
        updateQuestion={onQuestionChange}
      />
    </Stack>
  );
};
