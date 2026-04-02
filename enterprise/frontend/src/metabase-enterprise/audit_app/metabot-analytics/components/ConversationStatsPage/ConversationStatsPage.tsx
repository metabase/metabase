import { useState } from "react";
import { t } from "ttag";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
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

import { DATABASE_ID } from "../../constants";

import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { StatCards } from "./StatCards";

const DEFAULT_DATE = "past30days~";

function getDateLabel(value: string | null): string {
  if (!value) {
    return t`Date`;
  }
  const parsed = deserializeDateParameterValue(value);
  if (parsed) {
    return getDateFilterDisplayName(parsed, { withPrefix: false });
  }
  return t`Date`;
}

function getFilterDays(dateValue: string | null): number {
  if (!dateValue) {
    return 30;
  }
  const parsed = deserializeDateParameterValue(dateValue);
  if (parsed?.type === "relative" && parsed.value < 0) {
    return Math.abs(parsed.value);
  }
  return 30;
}

export function ConversationStatsPage() {
  const [dateValue, setDateValue] = useState(DEFAULT_DATE);
  const [dateOpened, setDateOpened] = useState(false);
  const daysNum = getFilterDays(dateValue);

  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: DATABASE_ID,
  });

  return (
    <>
      <Flex justify="space-between" align="center" mt="lg">
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
          <Skeleton h={350} mt="md" />
          <SimpleGrid cols={2} mt="md">
            <Skeleton h={350} />
            <Skeleton h={350} />
          </SimpleGrid>
        </>
      ) : (
        <>
          <ConversationsByDayChart days={daysNum} />
          <SimpleGrid cols={2} mt="md">
            <ConversationsByUserChart days={daysNum} />
            <ConversationsByProfileChart days={daysNum} />
          </SimpleGrid>
        </>
      )}
    </>
  );
}
