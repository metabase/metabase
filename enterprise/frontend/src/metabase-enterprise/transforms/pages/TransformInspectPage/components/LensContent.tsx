import { useCallback, useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Alert, Center, Stack, Title } from "metabase/ui";
import { useGetInspectorLensQuery } from "metabase-enterprise/api";
import type {
  InspectorDiscoveryResponse,
  TransformId,
} from "metabase-types/api";

import { useTriggerEvaluation } from "../hooks/useTriggerEvaluation";
import type { CardStats, LensRef } from "../types";

import { LensSection } from "./LensSections";
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

  const [cardStats, setCardStats] = useState<Record<string, CardStats>>({});

  const onStatsReady = useCallback((cardId: string, stats: CardStats) => {
    setCardStats((prev) => ({ ...prev, [cardId]: stats }));
  }, []);

  const { alerts, drillLenses } = useTriggerEvaluation(lens, cardStats);

  const drillLensRefs: LensRef[] = useMemo(() => {
    const lensMetadataMap = new Map(
      discovery.available_lenses.map((l) => [l.id, l]),
    );
    return drillLenses.map((l) => {
      const metadata = lensMetadataMap.get(l.lens_id);
      return {
        id: l.lens_id,
        params: l.params,
        title: l.reason ?? metadata?.display_name ?? l.lens_id,
      };
    });
  }, [drillLenses, discovery.available_lenses]);

  useEffect(() => {
    onDrillLensesChange?.(drillLensRefs);
  }, [drillLensRefs, onDrillLensesChange]);

  const cardsBySection = useMemo(() => {
    if (!lens) {
      return new Map();
    }
    const map = new Map<string, typeof lens.cards>();
    for (const card of lens.cards) {
      const sectionId = card.section_id ?? "default";
      const existing = map.get(sectionId) ?? [];
      map.set(sectionId, [...existing, card]);
    }
    return map;
  }, [lens]);

  if (isLoading || isFetching || error) {
    return (
      <Center h={200}>
        <LoadingAndErrorWrapper
          loading={isLoading || isFetching}
          error={error}
        />
      </Center>
    );
  }

  if (!lens) {
    return null;
  }

  const lensAlerts = alerts.filter(
    (a) => !a.condition.card_id || a.condition.card_id === "",
  );

  return (
    <Stack gap="xl">
      <Title order={2}>{currentLensRef.title ?? lens.display_name}</Title>

      {lens.summary && <LensSummary summary={lens.summary} />}

      {lensAlerts.length > 0 && (
        <Stack gap="sm">
          {lensAlerts.map((alert) => (
            <Alert
              key={alert.id}
              color={match(alert.severity)
                .with("error", () => "error" as const)
                .with("warning", () => "warning" as const)
                .otherwise(() => "brand" as const)}
              variant="light"
            >
              {alert.message}
            </Alert>
          ))}
        </Stack>
      )}

      {lens.sections.map((section) => (
        <LensSection
          key={section.id}
          section={section}
          lensId={lens.id}
          cards={cardsBySection.get(section.id) ?? []}
          cardSummaries={cardStats}
          alerts={alerts}
          drillTriggers={drillLenses}
          sources={discovery.sources}
          target={discovery.target}
          visitedFields={discovery.visited_fields}
          onStatsReady={onStatsReady}
          onDrill={onDrill}
        />
      ))}
    </Stack>
  );
};
