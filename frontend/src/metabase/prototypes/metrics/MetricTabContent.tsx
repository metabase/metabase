/* eslint-disable boundaries/element-types -- throwaway prototype: renders the real metric pages' tab content, as in the baseline. */
import { useGetMetricQuery } from "metabase/api/metric";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import { MetricDimensions } from "metabase/metrics/components/MetricDimensions";
import { MetricPageCard } from "metabase/metrics/components/MetricPageCard";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useLocation } from "metabase/router";
import { Box, Card, Center, Text } from "metabase/ui";
import type { CardId } from "metabase-types/api";

export const REAL_TABS = ["Overview", "Dimensions", "Dependencies"] as const;
export type RealTab = (typeof REAL_TABS)[number];

export const isRealTab = (tab: string): tab is RealTab =>
  REAL_TABS.some((realTab) => realTab === tab);

/** A metric's Overview, Dimensions or Dependencies tab, same as the baseline. */
export function MetricTabContent({
  tab,
  cardId,
}: {
  tab: RealTab;
  cardId: CardId | undefined;
}) {
  if (cardId == null) {
    return (
      <Text p="xl" c="text-secondary">
        No metrics in this instance yet to show this tab with.
      </Text>
    );
  }
  return (
    <MetricPageCard cardId={String(cardId)}>
      {(card, metadata) => {
        switch (tab) {
          case "Overview":
            return <Overview cardId={card.id} />;
          case "Dimensions":
            return (
              <Box mih={600}>
                <MetricDimensions metricId={card.id} queryMetadata={metadata} />
              </Box>
            );
          case "Dependencies":
            return <Dependencies cardId={card.id} />;
        }
      }}
    </MetricPageCard>
  );
}

function Overview({ cardId }: { cardId: CardId }) {
  const { data: metric, isLoading } = useGetMetricQuery(cardId);
  if (isLoading) {
    return (
      <Center p="xl">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }
  const dimensions = metric?.dimensions ?? [];
  if (dimensions.length === 0) {
    return (
      <Text p="xl" c="text-secondary">
        This metric has no dimensions to show an overview of.
      </Text>
    );
  }
  return <MetricDimensionGrid metricId={cardId} dimensions={dimensions} />;
}

function Dependencies({ cardId }: { cardId: CardId }) {
  const { pathname } = useLocation();
  if (!PLUGIN_DEPENDENCIES.isEnabled) {
    return (
      <Text p="xl" c="text-secondary">
        Dependencies need the enterprise dependencies feature.
      </Text>
    );
  }
  return (
    <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
      value={{ baseUrl: pathname, defaultEntry: { id: cardId, type: "card" } }}
    >
      <Card withBorder shadow="none" p={0} h={640}>
        <PLUGIN_DEPENDENCIES.DependencyGraphPage />
      </Card>
    </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
  );
}
