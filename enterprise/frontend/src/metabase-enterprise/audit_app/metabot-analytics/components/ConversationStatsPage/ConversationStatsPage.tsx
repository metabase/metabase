import { useMemo, useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useGetDatabaseMetadataQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Flex, SimpleGrid, Skeleton, Tabs, Title } from "metabase/ui";

import { AUDIT_DB_ID } from "../../constants";
import {
  ConversationFilters,
  DEFAULT_DATE,
  DEFAULT_GROUP,
  useFilterOptions,
} from "../ConversationFilters";

import S from "./ConversationStatsPage.module.css";
import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { ConversationsByIPAddressChart } from "./ConversationsByIPAddressChart";
import { ConversationsByProfileBarChart } from "./ConversationsByProfileBarChart";
import { ConversationsByProfileChart } from "./ConversationsByProfileChart";
import { ConversationsBySourceChart } from "./ConversationsBySourceChart";
import { ConversationsByUserChart } from "./ConversationsByUserChart";
import type { UsageStatsMetric } from "./query-utils";

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
  const [metric, setMetric] = useState<UsageStatsMetric>("conversations");

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
    <SettingsPageWrapper mt="sm">
      <Flex align="center" justify="space-between">
        <Title order={1} display="flex" style={{ alignItems: "center" }}>
          {t`Usage stats`}
        </Title>

        <ConversationFilters
          date={dateValue}
          onDateChange={setDateValue}
          user={user}
          onUserChange={setUser}
          group={group}
          onGroupChange={setGroup}
          userOptions={userOptions}
          groupOptions={groupOptions}
        />
      </Flex>

      <Tabs
        variant="pills"
        value={metric}
        onChange={(val) => setMetric(val as UsageStatsMetric)}
      >
        <Tabs.List className={S.metricTabs}>
          <Tabs.Tab
            className={S.metricTab}
            value="conversations"
          >{t`Conversations`}</Tabs.Tab>
          <Tabs.Tab
            className={S.metricTab}
            value="tokens"
          >{t`Tokens`}</Tabs.Tab>
          <Tabs.Tab
            className={S.metricTab}
            value="messages"
          >{t`Messages`}</Tabs.Tab>
        </Tabs.List>
      </Tabs>

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
          <ConversationsByDayChart dateFilter={dateFilter} metric={metric} />
          <SimpleGrid cols={2} spacing="lg">
            <ConversationsBySourceChart
              dateFilter={dateFilter}
              metric={metric}
            />
            <ConversationsByProfileBarChart
              dateFilter={dateFilter}
              metric={metric}
            />
          </SimpleGrid>
          <SimpleGrid cols={3} spacing="lg">
            <ConversationsByUserChart dateFilter={dateFilter} metric={metric} />
            <ConversationsByProfileChart
              dateFilter={dateFilter}
              metric={metric}
            />
            <ConversationsByIPAddressChart
              dateFilter={dateFilter}
              metric={metric}
            />
          </SimpleGrid>
        </>
      )}
    </SettingsPageWrapper>
  );
}
