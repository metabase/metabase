import { useCallback, useState } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { MetricAboutSection } from "metabase/metrics/components/MetricAboutSection";
import {
  type DefinitionState,
  MetricDefinitionSection,
} from "metabase/metrics/components/MetricDefinitionSection";
import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import { Center } from "metabase/ui";

import { MetricHomeHeader } from "./MetricHomeHeader";

type MetricHomePageParams = {
  slug: string;
};

type MetricHomePageProps = {
  params: MetricHomePageParams;
  routes: Array<{ path?: string }>;
  route: Route;
};

function getActiveTab(routes: Array<{ path?: string }>): string {
  if (routes.some((route) => route.path === "overview")) {
    return "overview";
  }
  if (routes.some((route) => route.path === "definition")) {
    return "definition";
  }
  return "about";
}

export function MetricHomePage({ params, routes, route }: MetricHomePageProps) {
  const cardId = Urls.extractEntityId(params.slug);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);
  const [definitionState, setDefinitionState] =
    useState<DefinitionState | null>(null);

  const handleDefinitionStateChange = useCallback(
    (state: DefinitionState) => {
      setDefinitionState(state);
    },
    [],
  );

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const activeTab = getActiveTab(routes);

  return (
    <PageContainer data-testid="metric-home-page">
      <MetricHomeHeader
        card={card}
        definitionState={activeTab === "definition" ? definitionState : null}
      />
      {activeTab === "overview" && card.id != null && (
        <MetricDimensionGrid metricId={card.id} />
      )}
      {activeTab === "definition" && (
        <MetricDefinitionSection
          card={card}
          route={route}
          onStateChange={handleDefinitionStateChange}
        />
      )}
      {activeTab === "about" && <MetricAboutSection card={card} />}
    </PageContainer>
  );
}
