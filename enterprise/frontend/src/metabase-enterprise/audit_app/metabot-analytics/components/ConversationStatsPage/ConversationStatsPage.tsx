import { useState } from "react";
import { t } from "ttag";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import { DateAllOptionsWidget } from "metabase/querying/parameters/components/DateAllOptionsWidget";
import {
  Button,
  Flex,
  Popover,
  SimpleGrid,
  Skeleton,
  Title,
} from "metabase/ui";

import { DATABASE_ID } from "../../constants";

import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { StatCards } from "./StatCards";
import { getDateLabel, getFilterDays } from "./utils";

export function ConversationStatsPage() {
  const [dateValue, setDateValue] = useState("past30days~");
  const [dateOpened, setDateOpened] = useState(false);
  const daysNum = getFilterDays(dateValue);

  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: DATABASE_ID,
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

      <StatCards days={daysNum} />

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
          <ConversationsByDayChart days={daysNum} />
          <SimpleGrid cols={2} spacing="lg">
            <ConversationsByUserChart days={daysNum} />
            <ConversationsByProfileChart days={daysNum} />
          </SimpleGrid>
        </>
      )}
    </>
  );
}
