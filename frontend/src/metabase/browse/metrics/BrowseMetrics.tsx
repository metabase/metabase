import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/metrics_bot.svg";
import { skipToken } from "metabase/api";
import { DetailPanel } from "metabase/common/components/DetailPanel";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { useDocsUrl } from "metabase/common/hooks";
import { canUserCreateQueries } from "metabase/current-user";
import { useNavSection } from "metabase/nav/containers/MainNavbar/use-nav-section";
import { PLUGIN_CONTENT_VERIFICATION, PLUGIN_LIBRARY } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isWithinIframe } from "metabase/utils/iframe";

import { BrowsePageLayout } from "../components/BrowsePageLayout";
import { partitionByAuthority } from "../utils";

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

  const { section, setSection } = useNavSection();
  const { official, unofficial } = useMemo(
    () => partitionByAuthority(metrics ?? []),
    [metrics],
  );
  const isOfficial = section === "official";
  const shown = isOfficial ? official : unofficial;

  const { data: libraryMetricCollection } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const newMetricLink = Urls.newMetric({
    collectionId: libraryMetricCollection?.id,
  });

  const hasDataAccess = useSelector(canUserCreateQueries);
  const isEmbeddingIframe = isWithinIframe();

  const canCreateMetric = !isEmbeddingIframe && hasDataAccess;

  return (
    <BrowsePageLayout
      icon="metric"
      title={t`Metrics`}
      titleId={titleId}
      testId="browse-metrics-header"
      meta={[
        t`Showing ${shown.length} of ${official.length + unofficial.length} metrics`,
        isOfficial ? t`Official only` : t`Unofficial only`,
      ]}
      description={t`The numbers your team has agreed on. Official metrics live in the Library or in a collection marked official; the rest are in the Unofficial half of the sidebar.`}
      actions={
        <>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => setSection(isOfficial ? "unofficial" : "official")}
          >
            {isOfficial ? t`Show unofficial` : t`Show official`}
          </Button>
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
        </>
      }
    >
      {isEmpty ? (
        <MetricsEmptyState
          canCreateMetric={canCreateMetric}
          newMetricLink={newMetricLink}
        />
      ) : (
        <DetailPanel
          flush
          title={isOfficial ? t`Official metrics` : t`Unofficial metrics`}
        >
          <DelayedLoadingAndErrorWrapper
            error={error}
            loading={isLoading}
            style={{ flex: 1 }}
            loader={<MetricsTable skeleton />}
          >
            {shown.length === 0 ? (
              <Text p="lg" c="text-secondary">
                {isOfficial
                  ? t`No official metrics yet. Publish a metric to the Library, or mark its collection official.`
                  : t`Every metric is official.`}
              </Text>
            ) : (
              <MetricsTable metrics={shown} />
            )}
          </DelayedLoadingAndErrorWrapper>
        </DetailPanel>
      )}
    </BrowsePageLayout>
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
              <Text lh="1.25rem" mt="sm" maw="25rem">
                {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
              </Text>
              <Flex pt="lg" align="center" justify="center" gap="lg">
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
  // Unjustified type cast. FIXME
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
