import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import {
  Button,
  Flex,
  Popover,
  SimpleGrid,
  Skeleton,
  Title,
} from "metabase/ui";

import { AUDIT_DB_ID } from "../../constants";

import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { StatCards } from "./StatCards";
import { getDateLabel } from "./utils";

const DEFAULT_DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

export function ConversationStatsPage() {
  const [dateValue, setDateValue] = useState("past30days~");
  const [dateOpened, setDateOpened] = useState(false);

  const dateFilter: DateFilterValue = useMemo(() => {
    if (!dateValue) {
      return DEFAULT_DATE_FILTER;
    }
    const parsed = deserializeDateParameterValue(dateValue);
    if (parsed && "type" in parsed) {
      return parsed as DateFilterValue;
    }
    return DEFAULT_DATE_FILTER;
  }, [dateValue]);

  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: AUDIT_DB_ID,
  });

  return (
    <>
      <Flex justify="space-between" align="center">
        <Title order={3}>{t`Trends`}</Title>
        <Popover
          opened={dateOpened}
          onChange={setDateOpened}
          position="bottom-end"
        >
          <Popover.Target>
            <Button variant="default" onClick={() => setDateOpened((o) => !o)}>
              {getDateLabel(dateValue)}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <DateAllOptionsWidget
              value={dateValue}
              onChange={(val) => {
                setDateValue(val);
                setDateOpened(false);
              }}
            />
          </Popover.Dropdown>
        </Popover>
      </Flex>

      <StatCards dateFilter={dateFilter} />

      <Title order={3} mt="xl">{t`Conversations`}</Title>

      {isLoadingMetadata ? (
        <>
          <Skeleton h={350} />
          <SimpleGrid cols={2} spacing="lg">
            <Skeleton h={350} />
            <Skeleton h={350} />
          </SimpleGrid>
        </>
      ) : (
        <>
          <ConversationsByDayChart dateFilter={dateFilter} />
          <SimpleGrid cols={2} spacing="lg">
            <ConversationsByUserChart dateFilter={dateFilter} />
            <ConversationsByProfileChart dateFilter={dateFilter} />
          </SimpleGrid>
        </>
      )}
    </>
  );
}
