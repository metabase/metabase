import { useCallback, useState } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import {
  type DefinitionState,
  MetricDefinitionSection,
} from "metabase/metrics/components/MetricDefinitionSection";
import { Center } from "metabase/ui";

import { MetricHeader } from "../../components/MetricHeader";

type MetricQueryPageParams = {
  cardId: string;
};

type MetricQueryPageProps = {
  params: MetricQueryPageParams;
  route: Route;
};

export function MetricQueryPage({ params, route }: MetricQueryPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
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

  return (
    <PageContainer pos="relative" data-testid="metric-query-editor" gap="xl">
      <MetricHeader
        card={card}
        actions={
          definitionState && (
            <PaneHeaderActions
              errorMessage={definitionState.errorMessage}
              isValid={definitionState.isValid}
              isDirty={definitionState.isDirty}
              isSaving={definitionState.isSaving}
              onSave={definitionState.onSave}
              onCancel={definitionState.onCancel}
            />
          )
        }
      />
      <MetricDefinitionSection
        card={card}
        route={route}
        onStateChange={handleDefinitionStateChange}
      />
    </PageContainer>
  );
}
