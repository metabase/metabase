import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { useGetInspectorLensQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import type { InspectorDiscoveryResponse, Transform } from "metabase-types/api";

import { useCardLoadingTracker, useTriggerEvaluation } from "../../hooks";
import type { LensHandle } from "../../types";
import { getLensKey } from "../LensNavigator/utils";
import {
  DefaultLensSections,
  GenericSummarySections,
  JoinAnalysisSections,
} from "../LensSections";

import { LensContentProvider } from "./LensContentContext";
import { useLensLoadedTracking } from "./useLensLoadedTracking";

type LensContentProps = {
  transform: Transform;
  lensHandle: LensHandle;
  discovery: InspectorDiscoveryResponse;
  navigateToLens: (lensHandle: LensHandle) => void;
  onAllCardsLoaded: (lensKey: string) => void;
  onTitleResolved: (tabKey: string, title: string) => void;
  onError: (lensHandle: LensHandle, error: unknown) => void;
};

export const LensContent = ({
  transform,
  lensHandle,
  discovery,
  navigateToLens,
  onAllCardsLoaded,
  onTitleResolved,
  onError,
}: LensContentProps) => {
  const trackLensLoaded = useLensLoadedTracking(
    transform.id,
    getLensKey(lensHandle),
  );

  const {
    data: lens,
    isLoading,
    error,
  } = useGetInspectorLensQuery({
    transformId: transform.id,
    lensId: lensHandle.id,
    lensParams: lensHandle.params,
  });

  useEffect(() => {
    if (!lens) {
      return;
    }
    onTitleResolved(getLensKey(lensHandle), lens.display_name);
  }, [lens, lensHandle, onTitleResolved]);

  useEffect(() => {
    if (error && !isLoading) {
      onError(lensHandle, error);
    }
  }, [error, isLoading, lensHandle, onError]);

  const {
    alertsByCardId,
    drillLensesByCardId,
    pushNewStats,
    collectedCardStats,
  } = useTriggerEvaluation(lens);

  const { markCardLoaded, markCardStartedLoading } = useCardLoadingTracker(
    lens,
    () => {
      if (lens) {
        onAllCardsLoaded(lens.id);
        trackLensLoaded();
      }
    },
  );

  const cardsBySection = useMemo(
    () => _.groupBy(lens?.cards ?? [], (c) => c.section_id ?? "default"),
    [lens],
  );

  if (isLoading || error || !lens) {
    return (
      <Center h={200}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <LensContentProvider
      transform={transform}
      lensHandle={lensHandle}
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
