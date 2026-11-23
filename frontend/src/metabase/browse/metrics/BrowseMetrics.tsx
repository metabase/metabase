/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/metrics_bot.svg";
import { skipToken } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { useDocsUrl } from "metabase/common/hooks";
import { canUserCreateQueries } from "metabase/current-user";
import { PageMetabotButton } from "metabase/nav/prototype/PageMetabotButton";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { useSyncedCollectionIds } from "metabase/nav/prototype/use-synced-collection-ids";
import { PLUGIN_CONTENT_VERIFICATION, PLUGIN_LIBRARY } from "metabase/plugins";
import { useSelector } from "metabase/redux";
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
import * as Urls from "metabase/urls";
import { isWithinIframe } from "metabase/utils/iframe";

import S from "../components/BrowseContainer.module.css";

import { MetricsTable } from "./MetricsTable";
import { trackNewMetricInitiated } from "./analytics";
import type { MetricFilterSettings, MetricResult } from "./types";
import { useFetchMetrics } from "./use-fetch-metrics";

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

  const { data: libraryMetricCollection } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const newMetricLink = Urls.newMetric({
    // PROTOTYPE: a read-only (e.g. git-synced) Library can't take the new
    // metric, so the save step asks where it goes instead.
    collectionId: libraryMetricCollection?.can_write
      ? libraryMetricCollection.id
      : undefined,
  });

  const hasDataAccess = useSelector(canUserCreateQueries);
  const isEmbeddingIframe = isWithinIframe();

  const canCreateMetric = !isEmbeddingIframe && hasDataAccess;

  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="lg"
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
            <Title order={1} c="text-primary" id={titleId}>
              <Group gap="sm">
                <Icon size={24} c="icon-brand" name="metric" />
                {t`Metrics`}
              </Group>
            </Title>
            <Group gap="xxs">
              {canCreateMetric && (
                <Tooltip label={t`Create a new metric`} position="bottom">
                  <ActionIcon
                    variant="subtle"
                    aria-label={t`Create a new metric`}
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
              {/* PROTOTYPE: "No top nav" puts Chat with Metabot last. */}
              <PageMetabotButton />
            </Group>
          </Flex>
        </Flex>
      </Flex>
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%">
          <Stack mb="xl" gap="lg" w="100%">
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
    "data-modeling/semantic-layer/metrics",
  );

  return (
    <Flex align="center" justify="center" mih="70vh">
      <Box maw="30rem">
        <EmptyState
          title={t`Create Metrics to define the official way to calculate important numbers for your team`}
          message={
            <Box>
              <Text lh="1.25rem" mt="sm" maw="25rem">
                {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
              </Text>
              <Flex pt="lg" align="center" justify="center" gap="lg">
                {showMetabaseLinks && (
                  <Button
                    component={ExternalLink}
                    href={metricsDocsLink}
                    variant="subtle"
                  >{t`Read the docs`}</Button>
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
  // Unjustified type cast. FIXME
  const allMetrics = metricsResult.data?.data as MetricResult[] | undefined;

  // PROTOTYPE: "Modern nav - C" without git lists only the metrics saved
  // outside synced collections (the Library included).
  const { variant } = useNavVariant();
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const isUnsyncedOnly = variant === "modern-nav-c" && !isGitIntegrationEnabled;
  const syncedCollectionIds = useSyncedCollectionIds({
    skip: !isUnsyncedOnly,
  });
  const metrics = isUnsyncedOnly
    ? allMetrics?.filter(
        (metric) => !syncedCollectionIds.has(metric.collection.id),
      )
    : allMetrics;

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
