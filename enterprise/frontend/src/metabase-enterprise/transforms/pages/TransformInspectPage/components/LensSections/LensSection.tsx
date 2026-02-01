import { match } from "ts-pattern";

import { Stack, Text, Title } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorSection,
  TransformInspectSource,
  TransformInspectTarget,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import type { CardStats, LensRef } from "../../types";

import { ComparisonLayout } from "./ComparisonLayout";
import { FlatLayout } from "./FlatLayout";
import { GenericSummaryLayout } from "./GenericSummaryLayout";
import { JoinAnalysisLayout } from "./JoinAnalysisLayout";

type LensSectionProps = {
  section: InspectorSection;
  lensId: string;
  cards: InspectorCard[];
  cardSummaries: Record<string, CardStats>;
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  visitedFields?: TransformInspectVisitedFields;
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const LensSection = ({
  section,
  lensId,
  cards,
  cardSummaries,
  alerts,
  drillTriggers,
  sources,
  target,
  visitedFields,
  onStatsReady,
  onDrill,
}: LensSectionProps) => {
  const layout = match(lensId)
    .with("generic-summary", () => "generic-summary" as const)
    .with("join-analysis", () => "join-analysis" as const)
    .otherwise(() => section.layout ?? "flat");

  if (cards.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      <Title order={3}>{section.title}</Title>
      {section.description && (
        <Text c="text-secondary">{section.description}</Text>
      )}
      {match(layout)
        .with("generic-summary", () => (
          <GenericSummaryLayout
            cards={cards}
            sources={sources}
            target={target}
            onStatsReady={onStatsReady}
          />
        ))
        .with("comparison", () => (
          <ComparisonLayout
            cards={cards}
            cardSummaries={cardSummaries}
            alerts={alerts}
            drillTriggers={drillTriggers}
            sources={sources}
            visitedFields={visitedFields}
            onStatsReady={onStatsReady}
            onDrill={onDrill}
          />
        ))
        .with("join-analysis", () => (
          <JoinAnalysisLayout
            cards={cards}
            alerts={alerts}
            drillTriggers={drillTriggers}
            onStatsReady={onStatsReady}
            onDrill={onDrill}
          />
        ))
        .otherwise(() => (
          <FlatLayout
            cards={cards}
            cardSummaries={cardSummaries}
            alerts={alerts}
            drillTriggers={drillTriggers}
            onStatsReady={onStatsReady}
            onDrill={onDrill}
          />
        ))}
    </Stack>
  );
};
