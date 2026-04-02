import { useState } from "react";
import { t } from "ttag";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import { Flex, Select, SimpleGrid, Skeleton, Title } from "metabase/ui";

import { DATABASE_ID } from "../../constants";

import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { StatCards } from "./StatCards";

function getDateRangeOptions() {
  return [
    { value: "7", label: t`Past 7 days` },
    { value: "14", label: t`Past 14 days` },
    { value: "30", label: t`Past 30 days` },
    { value: "60", label: t`Past 60 days` },
    { value: "90", label: t`Past 90 days` },
  ];
}

export function ConversationStatsPage() {
  const [days, setDays] = useState("30");
  const daysNum = parseInt(days, 10);

  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: DATABASE_ID,
  });

  return (
    <>
      <Flex justify="space-between" align="center" mt="lg">
        <Title order={3}>{t`Trends`}</Title>
        <Select
          data={getDateRangeOptions()}
          value={days}
          onChange={(val) => val && setDays(val)}
          w={160}
        />
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
