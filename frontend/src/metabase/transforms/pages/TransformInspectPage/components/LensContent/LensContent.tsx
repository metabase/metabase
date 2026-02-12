import { useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { useGetInspectorLensQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { InspectorDiscoveryResponse, Transform } from "metabase-types/api";

import { useCardLoadingTracker, useTriggerEvaluation } from "../../hooks";
import type { Lens, LensQueryParams } from "../../types";
import { isDrillLens } from "../../utils";
import {
  DefaultLensSections,
  GenericSummarySections,
  JoinAnalysisSections,
} from "../LensSections";

import { LensContentProvider } from "./LensContentContext";

type LensContentProps = {
  transform: Transform;
  currentLens: Lens;
  discovery: InspectorDiscoveryResponse;
  onDrill: (lens: TriggeredDrillLens) => void;
  onAllCardsLoaded: (lensId: string) => void;
};

export const LensContent = ({
  transform,
  currentLens,
  discovery,
  onDrill,
  onAllCardsLoaded,
}: LensContentProps) => {
  const queryParams = useMemo<LensQueryParams>(() => {
    if (isDrillLens(currentLens)) {
      return { lensId: currentLens.lens_id, params: currentLens.params };
    }
    return { lensId: currentLens.id, params: undefined };
  }, [currentLens]);

  const {
    data: lens,
    isLoading,
    isFetching,
    error,
  } = useGetInspectorLensQuery({ transformId: transform.id, ...queryParams });

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

  if (isLoading || isFetching || error || !lens) {
    return (
      <Center h={200}>
        <LoadingAndErrorWrapper
          loading={isLoading || isFetching}
          error={error}
        />
      </Center>
    );
  }

  return (
    <LensContentProvider
      transform={transform}
      lens={lens}
      queryParams={queryParams}
      alertsByCardId={alertsByCardId}
      drillLensesByCardId={drillLensesByCardId}
      collectedCardStats={collectedCardStats}
      onStatsReady={pushNewStats}
      onCardStartedLoading={markCardStartedLoading}
      onCardLoaded={markCardLoaded}
      onDrill={onDrill}
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
