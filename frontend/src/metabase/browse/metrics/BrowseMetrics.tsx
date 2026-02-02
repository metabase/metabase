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
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_CONTENT_VERIFICATION,
  PLUGIN_DATA_STUDIO,
} from "metabase/plugins";
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

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

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
    PLUGIN_DATA_STUDIO.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const newMetricLink = Urls.newQuestion({
    mode: "query",
    cardType: "metric",
    collectionId: libraryMetricCollection?.id,
  });

  const hasDataAccess = useSelector(canUserCreateQueries);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  const canCreateMetric = !isEmbeddingIframe && hasDataAccess;

  return (
    <BrowseContainer aria-labelledby={titleId}>
      <BrowseHeader role="heading" data-testid="browse-metrics-header">
        <BrowseSection>
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
                    onClick={() => trackNewMetricInitiated()}
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
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
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
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
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
