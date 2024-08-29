import { t } from "ttag";

import NoResults from "assets/img/metrics_bot.svg";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import EmptyState from "metabase/components/EmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Flex, Group, Icon, Stack, Text, Title } from "metabase/ui";

import type { MetricResult } from "../types";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "./BrowseContainer.styled";
import { MetricsTable } from "./MetricsTable";

export function BrowseMetrics() {
  const metricsResult = useFetchMetrics({
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
  });
  const metrics = metricsResult.data?.data as MetricResult[] | undefined;

  const isEmpty = !metricsResult.isLoading && !metrics?.length;

  return (
    <BrowseContainer>
      <BrowseHeader role="heading" data-testid="browse-metrics-header">
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} color="text-dark">
              <Group spacing="sm">
                <Icon
                  size={24}
                  color="var(--mb-color-icon-primary)"
                  name="metric"
                />
                {t`Metrics`}
              </Group>
            </Title>
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <Stack mb="lg" spacing="md" w="100%">
            {isEmpty ? (
              <MetricsEmptyState />
            ) : (
              <DelayedLoadingAndErrorWrapper
                error={metricsResult.error}
                loading={metricsResult.isLoading}
                style={{ flex: 1 }}
                loader={<MetricsTable skeleton />}
              >
                <MetricsTable metrics={metrics} />
              </DelayedLoadingAndErrorWrapper>
            )}
          </Stack>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
}

function MetricsEmptyState() {
  return (
    <Flex align="center" justify="center" mih="70vh">
      <Box maw="25rem">
        <EmptyState
          title={t`Metrics help you summarize and analyze your data effortlessly.`}
          message={
            <Text mt="sm" maw="25rem">
              {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
            </Text>
          }
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    </Flex>
  );
}
