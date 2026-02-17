import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { useGetInspectorLensQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import type { InspectorDiscoveryResponse, Transform } from "metabase-types/api";

import { useCardLoadingTracker, useTriggerEvaluation } from "../../hooks";
import type { LensRef } from "../../types";
import { getLensKey } from "../LensNavigator/utils";
import {
  DefaultLensSections,
  GenericSummarySections,
  JoinAnalysisSections,
} from "../LensSections";

import { LensContentProvider } from "./LensContentContext";

type LensContentProps = {
  transform: Transform;
  lensRef: LensRef;
  discovery: InspectorDiscoveryResponse;
  navigateToLens: (lensRef: LensRef) => void;
  onAllCardsLoaded: (lensKey: string) => void;
  onTitleResolved: (tabKey: string, title: string) => void;
  onError: (lensKey: string) => void;
};

export const LensContent = ({
  transform,
  lensRef,
  discovery,
  navigateToLens,
  onAllCardsLoaded,
  onTitleResolved,
  onError,
}: LensContentProps) => {
  const {
    data: lens,
    isLoading,
    isFetching,
    error,
  } = useGetInspectorLensQuery({
    transformId: transform.id,
    lensId: lensRef.id,
    lensParams: lensRef.params,
  });

  useEffect(() => {
    if (!lens) {
      return;
    }
    onTitleResolved(getLensKey(lensRef), lens.display_name);
  }, [lens, lensRef, onTitleResolved]);

  useEffect(() => {
    if (error && !isLoading) {
      onError(getLensKey(lensRef));
    }
  }, [error, isLoading, lensRef, onError]);

  const {
    alertsByCardId,
    drillLensesByCardId,
    pushNewStats,
    collectedCardStats,
  } = useTriggerEvaluation(lens);

  const { markCardLoaded, markCardStartedLoading } = useCardLoadingTracker(
    lens,
    onAllCardsLoaded,
  );

  const cardsBySection = useMemo(
    () => _.groupBy(lens?.cards ?? [], (c) => c.section_id ?? "default"),
    [lens],
  );

  if (isLoading || isFetching || !lens) {
    return (
      <Center h={200}>
        <LoadingAndErrorWrapper loading={isLoading || isFetching} />
      </Center>
    );
  }

  return (
    <LensContentProvider
      transform={transform}
      lensRef={lensRef}
      lens={lens}
      alertsByCardId={alertsByCardId}
      drillLensesByCardId={drillLensesByCardId}
      collectedCardStats={collectedCardStats}
      navigateToLens={navigateToLens}
      onStatsReady={pushNewStats}
      onCardStartedLoading={markCardStartedLoading}
      onCardLoaded={markCardLoaded}
    >
      <Stack gap="xl">
        {match(lens.id)
          .with("generic-summary", () => (
            <GenericSummarySections
              sections={lens.sections}
              cardsBySection={cardsBySection}
              sources={discovery.sources}
              target={discovery.target}
            />
          ))
          .with("join-analysis", () => (
            <JoinAnalysisSections
              sections={lens.sections}
              cardsBySection={cardsBySection}
            />
          ))
          .otherwise(() => (
            <DefaultLensSections
              sections={lens.sections}
              cardsBySection={cardsBySection}
              sources={discovery.sources}
              visitedFields={discovery.visited_fields}
            />
          ))}
      </Stack>
    </LensContentProvider>
  );
};
