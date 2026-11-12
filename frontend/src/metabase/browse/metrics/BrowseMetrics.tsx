/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/metrics_bot.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { useDocsUrl } from "metabase/common/hooks";
import { canUserCreateQueries } from "metabase/current-user";
import { PLUGIN_LIBRARY } from "metabase/plugins";
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
import type { MetricResult } from "./types";
import { useFetchMetrics } from "./use-fetch-metrics";

export function BrowseMetrics() {
  const { isLoading, error, metrics } = useMetrics();

  const isEmpty = !isLoading && !error && !metrics?.length;
  const titleId = useMemo(() => _.uniqueId("browse-metrics"), []);

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

function useMetrics() {
  const metricsResult = useFetchMetrics({
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
  });

  return {
    isLoading: metricsResult.isLoading,
    error: metricsResult.error,
    // Unjustified type cast. FIXME
    metrics: metricsResult.data?.data as MetricResult[] | undefined,
  };
}
