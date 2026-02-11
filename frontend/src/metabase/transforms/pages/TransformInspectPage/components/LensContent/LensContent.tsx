import { useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { useGetInspectorLensQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type {
  InspectorDiscoveryResponse,
  TransformId,
} from "metabase-types/api";

import { useTriggerEvaluation } from "../../hooks";
import type { Lens } from "../../types";
import { isDrillLens } from "../../utils";
import {
  DefaultLensSections,
  GenericSummarySections,
  JoinAnalysisSections,
} from "../LensSections";

import { LensContentProvider } from "./LensContentContext";
import { LensSummary } from "./LensSummary";

type LensContentProps = {
  transformId: TransformId;
  currentLens: Lens;
  discovery: InspectorDiscoveryResponse;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const LensContent = ({
  transformId,
  currentLens,
  discovery,
  onDrill,
}: LensContentProps) => {
  const queryParams = (() => {
    if (isDrillLens(currentLens)) {
      return { lensId: currentLens.lens_id, params: currentLens.params };
    }
    return { lensId: currentLens.id, params: undefined };
  })();

  const {
    data: lens,
    isLoading,
    isFetching,
    error,
  } = useGetInspectorLensQuery({ transformId, ...queryParams });

  const {
    alertsByCardId,
    drillLensesByCardId,
    pushNewStats,
    collectedCardStats,
  } = useTriggerEvaluation(lens);

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
      lens={lens}
      alertsByCardId={alertsByCardId}
      drillLensesByCardId={drillLensesByCardId}
      collectedCardStats={collectedCardStats}
      onStatsReady={pushNewStats}
      onDrill={onDrill}
    >
      <Stack gap="xl">
        {match(lens.id)
          .with("generic-summary", "join-analysis", () => null)
          .otherwise(
            () => lens.summary && <LensSummary summary={lens.summary} />,
          )}
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
