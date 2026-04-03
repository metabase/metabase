import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetDatabaseMetadataQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { SimpleGrid, Skeleton, Title } from "metabase/ui";

import { AUDIT_DB_ID } from "../../constants";
import {
  ConversationFilters,
  DEFAULT_DATE,
  DEFAULT_GROUP,
  useFilterOptions,
} from "../ConversationFilters";

import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import { StatCards } from "./StatCards";

const DEFAULT_DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

export function ConversationStatsPage() {
  const [dateValue, setDateValue] = useState(DEFAULT_DATE);
  const [user, setUser] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(DEFAULT_GROUP);
  const [profile, setProfile] = useState<string | null>(null);

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

  const { userOptions, groupOptions } = useFilterOptions();
  const { isLoading: isLoadingMetadata } = useGetDatabaseMetadataQuery({
    id: AUDIT_DB_ID,
  });

  return (
    <>
      <ConversationFilters
        date={dateValue}
        onDateChange={setDateValue}
        user={user}
        onUserChange={setUser}
        group={group}
        onGroupChange={setGroup}
        profile={profile}
        onProfileChange={setProfile}
        userOptions={userOptions}
        groupOptions={groupOptions}
        profileOptions={[]}
      />

      <Title order={3}>{t`Trends`}</Title>

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
