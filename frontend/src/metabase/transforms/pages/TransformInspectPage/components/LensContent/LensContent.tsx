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

  const { alerts, drillLenses, pushNewStats } = useTriggerEvaluation(lens);

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
    <Stack gap="xl">
      {match(lens.id)
        .with("generic-summary", () => null)
        .otherwise(
          () => lens.summary && <LensSummary summary={lens.summary} />,
        )}
      {match(lens.id)
        .with("generic-summary", () => (
          <GenericSummarySections
            lens={lens}
            sections={lens.sections}
            cardsBySection={cardsBySection}
            sources={discovery.sources}
            target={discovery.target}
            onStatsReady={pushNewStats}
          />
        ))
        .with("join-analysis", () => (
          <JoinAnalysisSections
            lens={lens}
            sections={lens.sections}
            cardsBySection={cardsBySection}
            alerts={alerts}
            drillLenses={drillLenses}
            onStatsReady={pushNewStats}
            onDrill={onDrill}
          />
        ))
        .otherwise(() => (
          <DefaultLensSections
            lens={lens}
            sections={lens.sections}
            cardsBySection={cardsBySection}
            alerts={alerts}
            drillLenses={drillLenses}
            sources={discovery.sources}
            visitedFields={discovery.visited_fields}
            onStatsReady={pushNewStats}
            onDrill={onDrill}
          />
        ))}
    </Stack>
  );
};
