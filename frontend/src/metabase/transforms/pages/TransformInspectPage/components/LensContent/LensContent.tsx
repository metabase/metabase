import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { useGetInspectorLensQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack, Title } from "metabase/ui";
import type {
  InspectorDiscoveryResponse,
  TransformId,
} from "metabase-types/api";

import { useTriggerEvaluation } from "../../hooks";
import type { LensRef } from "../../types";
import {
  DefaultLensSections,
  GenericSummarySections,
  JoinAnalysisSections,
} from "../LensSections";

import { LensSummary } from "./LensSummary";

type LensContentProps = {
  transformId: TransformId;
  currentLensRef: LensRef;
  discovery: InspectorDiscoveryResponse;
  onDrill: (lensRef: LensRef) => void;
  onDrillLensesChange?: (drillLenses: LensRef[]) => void;
};

export const LensContent = ({
  transformId,
  currentLensRef,
  discovery,
  onDrill,
  onDrillLensesChange,
}: LensContentProps) => {
  const {
    data: lens,
    isLoading,
    isFetching,
    error,
  } = useGetInspectorLensQuery({
    transformId,
    lensId: currentLensRef.id,
    params: currentLensRef.params,
  });

  const { alerts, drillLenses, drillLensesRefs, pushNewStats } =
    useTriggerEvaluation(lens, discovery.available_lenses);

  useEffect(() => {
    onDrillLensesChange?.(drillLensesRefs);
  }, [drillLensesRefs, onDrillLensesChange]);

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
      <Title order={2}>{currentLensRef.title}</Title>
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
