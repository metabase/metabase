import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { TableNotificationsTrigger } from "metabase/notifications/modals";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip"; // TODO: we should not use query builder components
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components"; // TODO: we should not use query builder components
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Button, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Table as ApiTable } from "metabase-types/api";

import { EditTableDataBackButton } from "./EditTableDataBackButton";
import { EditTableDataFilterButton } from "./EditTableDataFilterButton";

interface EditTableDataHeaderProps {
  table: Table | ApiTable;
  question: Question;
  isLoading: boolean;
  onCreate: () => void;
  onQuestionChange: (newQuestion: Question) => void;
  refetchTableDataQuery: () => void;
}

export const EditTableDataHeader = ({
  table,
  question,
  isLoading,
  onCreate,
  onQuestionChange,
  refetchTableDataQuery,
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
          <RunButtonWithTooltip
            iconSize={16}
            onlyIcon
            medium
            compact
            isRunning={isLoading}
            onRun={refetchTableDataQuery}
          />
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
