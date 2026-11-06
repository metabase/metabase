import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListTablesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useNavigate, useSearchParams } from "metabase/router";
import { Box, Select, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  type ConcreteTableId,
  type Table,
  isConcreteTableId,
} from "metabase-types/api";

import { HabitAnalysis } from "../components/HabitAnalysis";

const EVENT_TABLE_ENTITY_TYPE = "entity/EventTable";

const isNotEventTable = (table: Table) =>
  table.entity_type !== EVENT_TABLE_ENTITY_TYPE;

const parseTableId = (value: string | null): ConcreteTableId | undefined => {
  const id = Number(value);
  return value !== null && isConcreteTableId(id) ? id : undefined;
};

/**
 * A new analysis. Without a table in the URL, it waits for one to be picked,
 * with the tables sync recognized as event tables first.
 */
export const NewAnalysisPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tableId = parseTableId(searchParams.get("table"));
  const {
    data: tables = [],
    error,
    isLoading,
  } = useListTablesQuery(
    tableId === undefined ? { "can-query": true } : skipToken,
  );

  if (tableId !== undefined) {
    return <HabitAnalysis tableId={tableId} />;
  }

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      <Box p="xl" maw="32rem">
        <Stack>
          <Title order={2}>{t`Habit analysis`}</Title>
          <Select
            label={t`Event table`}
            placeholder={t`Pick a table`}
            searchable
            data={_.sortBy(tables, isNotEventTable).map((table) => ({
              value: String(table.id),
              label: table.display_name,
            }))}
            onChange={(value) => {
              const id = parseTableId(value);
              if (id !== undefined) {
                navigate(Urls.newAnalysis(id));
              }
            }}
          />
        </Stack>
      </Box>
    </LoadingAndErrorWrapper>
  );
};
