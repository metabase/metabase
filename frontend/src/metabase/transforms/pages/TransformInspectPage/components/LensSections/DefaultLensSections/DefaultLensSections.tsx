import { match } from "ts-pattern";

import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorLens,
  InspectorSection,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import type { CardStats, LensRef } from "../../../types";
import { SectionsRenderer } from "../SectionsRenderer";

import { ComparisonLayout } from "./components/ComparisonLayout";
import { FlatLayout } from "./components/FlatLayout";

type DefaultLensSectionsProps = {
  lens: InspectorLens;
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  sources: TransformInspectSource[];
  visitedFields?: TransformInspectVisitedFields;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const DefaultLensSections = ({
  lens,
  sections,
  cardsBySection,
  alerts,
  drillLenses,
  sources,
  visitedFields,
  onStatsReady,
  onDrill,
}: DefaultLensSectionsProps) => (
  <SectionsRenderer sections={sections} cardsBySection={cardsBySection}>
    {(cards: InspectorCard[], section: InspectorSection) =>
      match(section.layout ?? "flat")
        .with("comparison", () => (
          <ComparisonLayout
            lens={lens}
            cards={cards}
            alerts={alerts}
            drillLenses={drillLenses}
            sources={sources}
            visitedFields={visitedFields}
            onStatsReady={onStatsReady}
            onDrill={onDrill}
          />
        ))
        .with("flat", () => (
          <FlatLayout
            lens={lens}
            cards={cards}
            alerts={alerts}
            drillLenses={drillLenses}
            onStatsReady={onStatsReady}
            onDrill={onDrill}
          />
        ))
        .exhaustive()
    }
  </SectionsRenderer>
);
