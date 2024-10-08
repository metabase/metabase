import { useState } from "react";
import { t } from "ttag";

import NoResults from "assets/img/metrics_bot.svg";
import { skipToken } from "metabase/api";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import EmptyState from "metabase/components/EmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

import { MetricsTable } from "./MetricsTable";
import type { MetricFilterSettings, MetricResult } from "./types";

const {
  contentVerificationEnabled,
  MetricFilterControls,
  getDefaultMetricFilters,
} = PLUGIN_CONTENT_VERIFICATION;

export function BrowseMetrics() {
  const [metricFilters, setMetricFilters] = useMetricFilterSettings();
  const { isLoading, error, metrics, hasVerifiedMetrics } =
    useFilteredMetrics(metricFilters);

  const isEmpty = !isLoading && !metrics?.length;

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
            {hasVerifiedMetrics && (
              <MetricFilterControls
                metricFilters={metricFilters}
                setMetricFilters={setMetricFilters}
              />
            )}
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
                error={error}
                loading={isLoading}
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
  const newMetricLink = Urls.newQuestion({
    mode: "query",
    cardType: "metric",
  });

  return (
    <Flex align="center" justify="center" mih="70vh">
      <Box maw="25rem">
        <EmptyState
          title={t`Metrics help you summarize and analyze your data effortlessly.`}
          message={
            <Box>
              <Text mt="sm" maw="25rem">
                {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
              </Text>
              <Box pt="md">
                <Button
                  component={Link}
                  to={newMetricLink}
                  variant="filled"
                >{t`Create metric`}</Button>
              </Box>
            </Box>
          }
          illustrationElement={<img src={NoResults} />}
        />
      </Box>
    </Flex>
  );
}

function useMetricFilterSettings() {
  const defaultMetricFilters = useSelector(getDefaultMetricFilters);
  return useState(defaultMetricFilters);
}

function useHasVerifiedMetrics() {
  const result = useFetchMetrics(
    contentVerificationEnabled
      ? {
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          limit: 0,
          verified: true,
        }
      : skipToken,
  );

  if (!contentVerificationEnabled) {
    return {
      isLoading: false,
      error: null,
      result: false,
    };
  }

  const total = result.data?.total ?? 0;

  return {
    isLoading: result.isLoading,
    error: result.error,
    result: total > 0,
  };
}

function useFilteredMetrics(metricFilters: MetricFilterSettings) {
  const hasVerifiedMetrics = useHasVerifiedMetrics();

  const filters = cleanMetricFilters(metricFilters, hasVerifiedMetrics.result);

  const metricsResult = useFetchMetrics(
    hasVerifiedMetrics.isLoading || hasVerifiedMetrics.error
      ? skipToken
      : {
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          ...filters,
        },
  );

  const isLoading = hasVerifiedMetrics.isLoading || metricsResult.isLoading;
  const error = hasVerifiedMetrics.error || metricsResult.error;
  const metrics = metricsResult.data?.data as MetricResult[] | undefined;

  return {
    isLoading,
    error,
    hasVerifiedMetrics: hasVerifiedMetrics.result,
    metrics,
  };
}

function cleanMetricFilters(
  metricFilters: MetricFilterSettings,
  hasVerifiedMetrics: boolean,
) {
  const filters = { ...metricFilters };
  if (!hasVerifiedMetrics || !filters.verified) {
    // we cannot pass false or undefined to the backend
    // delete the key instead
    delete filters.verified;
  }
  return filters;
}
