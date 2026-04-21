import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/metrics_bot.svg";
import { skipToken } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDocsUrl } from "metabase/common/hooks";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import { trackMetricCreateStarted } from "metabase/data-studio/analytics";
import { PLUGIN_CONTENT_VERIFICATION, PLUGIN_LIBRARY } from "metabase/plugins";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { canUserCreateQueries } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

import S from "../components/BrowseContainer.module.css";

import { MetricsTable } from "./MetricsTable";
import { trackNewMetricInitiated } from "./analytics";
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

  const isEmpty = !isLoading && !error && !metrics?.length;
  const titleId = useMemo(() => _.uniqueId("browse-metrics"), []);

  const libraryMetricCollection =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const newMetricLink = Urls.newMetric({
    collectionId: libraryMetricCollection?.id,
  });

  const hasDataAccess = useSelector(canUserCreateQueries);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  const canCreateMetric = !isEmbeddingIframe && hasDataAccess;

  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="md"
      aria-labelledby={titleId}
    >
      <Flex
        className={S.browseHeader}
        direction="column"
        role="heading"
        data-testid="browse-metrics-header"
      >
        <Flex maw="64rem" mx="auto" w="100%">
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={2} c="text-primary" id={titleId}>
              <Group gap="sm">
                <Icon size={24} c="icon-brand" name="metric" />
                {t`Metrics`}
              </Group>
            </Title>
            <Group gap="xs">
              {canCreateMetric && (
                <Tooltip label={t`Create a new metric`} position="bottom">
                  <ActionIcon
                    aria-label={t`Create a new metric`}
                    size={32}
                    variant="viewHeader"
                    component={ForwardRefLink}
                    to={newMetricLink}
                    onClick={() => {
                      trackNewMetricInitiated();
                      trackMetricCreateStarted("browse_metrics");
                    }}
                  >
                    <Icon name="add" />
                  </ActionIcon>
                </Tooltip>
              )}
              {hasVerifiedMetrics && (
                <MetricFilterControls
                  metricFilters={metricFilters}
                  setMetricFilters={setMetricFilters}
                />
              )}
            </Group>
          </Flex>
        </Flex>
      </Flex>
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%">
          <Stack mb="lg" gap="md" w="100%">
            {isEmpty ? (
              <MetricsEmptyState
                canCreateMetric={canCreateMetric}
                newMetricLink={newMetricLink}
              />
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
        </Flex>
      </Flex>
    </Flex>
  );
}

function MetricsEmptyState({
  canCreateMetric,
  newMetricLink,
}: {
  canCreateMetric: boolean;
  newMetricLink: string;
}) {
  const { url: metricsDocsLink, showMetabaseLinks } = useDocsUrl(
    "data-modeling/metrics",
  );

  return (
    <Flex align="center" justify="center" mih="70vh">
      <Box maw="30rem">
        <EmptyState
          title={t`Create Metrics to define the official way to calculate important numbers for your team`}
          message={
            <Box>
              <Text mt="sm" maw="25rem">
                {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
              </Text>
              <Flex pt="md" align="center" justify="center" gap="md">
                {showMetabaseLinks && (
                  <Link
                    target="_blank"
                    to={metricsDocsLink}
                    variant="brandBold"
                  >{t`Read the docs`}</Link>
                )}
                {canCreateMetric && (
                  <Button
                    component={Link}
                    to={newMetricLink}
                    variant="filled"
                    onClick={() => trackMetricCreateStarted("browse_metrics")}
                  >{t`Create metric`}</Button>
                )}
              </Flex>
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
