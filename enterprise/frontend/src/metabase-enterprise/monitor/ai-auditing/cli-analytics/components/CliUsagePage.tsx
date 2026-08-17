import { t } from "ttag";

import { SimpleGrid, Stack, Title } from "metabase/ui";
import { buildCallsByDayByStatusQuery } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";

import { useCliAnalyticsContext } from "./CliAnalyticsSectionLayout";
import { CliBreakoutChart } from "./CliBreakoutChart";
import { CliCallerLivenessTable } from "./CliCallerLivenessTable";
import { CliCallsTimelineChart } from "./CliCallsTimelineChart";

export function CliUsagePage() {
  const { dataSources, chartFilters, hasErrors } = useCliAnalyticsContext();

  return (
    <Stack gap="lg">
      <CliCallsTimelineChart
        {...dataSources}
        {...chartFilters}
        title={t`Calls by client over time`}
      />
      <SimpleGrid cols={2} spacing="lg">
        <CliBreakoutChart
          {...dataSources}
          {...chartFilters}
          title={t`Calls by client`}
          display="pie"
          breakoutColumn="client_display_name"
          h={500}
        />
        <CliBreakoutChart
          {...dataSources}
          {...chartFilters}
          title={t`Calls by operation`}
          display="row"
          breakoutColumn="operation"
          h={500}
        />
      </SimpleGrid>
      <SimpleGrid cols={2} spacing="lg">
        <CliBreakoutChart
          {...dataSources}
          {...chartFilters}
          title={t`Calls by user`}
          display="row"
          breakoutColumn="user_display_name"
          h={500}
        />
        <CliCallerLivenessTable
          {...dataSources}
          {...chartFilters}
          title={t`User activity`}
          h={500}
        />
      </SimpleGrid>

      {hasErrors && (
        <>
          <Title order={3} mt="md">{t`Errors`}</Title>
          <CliCallsTimelineChart
            {...dataSources}
            {...chartFilters}
            title={t`Calls by status over time`}
            buildQuery={buildCallsByDayByStatusQuery}
          />
          <CliBreakoutChart
            {...dataSources}
            {...chartFilters}
            title={t`Errors by operation`}
            display="row"
            breakoutColumn="operation"
            errorsOnly
            h={500}
          />
        </>
      )}
    </Stack>
  );
}
