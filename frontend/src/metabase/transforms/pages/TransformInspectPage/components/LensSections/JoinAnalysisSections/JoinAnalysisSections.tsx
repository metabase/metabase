import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorLens,
  InspectorSection,
} from "metabase-types/api";

import type { CardStats } from "../../../types";

import { JoinAnalysisSection } from "./JoinAnalysisSection";

type JoinAnalysisSectionsProps = {
  lens: InspectorLens;
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  collectedCardStats: Record<string, CardStats>;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const JoinAnalysisSections = ({
  lens,
  sections,
  cardsBySection,
  alertsByCardId,
  drillLensesByCardId,
  collectedCardStats,
  onStatsReady,
  onDrill,
}: JoinAnalysisSectionsProps) =>
  sections.map((section) => {
    const cards = cardsBySection[section.id];
    return (
      <JoinAnalysisSection
        key={section.id}
        lens={lens}
        cards={cards}
        alertsByCardId={alertsByCardId}
        drillLensesByCardId={drillLensesByCardId}
        collectedCardStats={collectedCardStats}
        onStatsReady={onStatsReady}
        onDrill={onDrill}
      />
    );
  });
