import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorLens,
  InspectorSection,
} from "metabase-types/api";

import type { CardStats, LensRef } from "../../../types";
import { SectionsRenderer } from "../SectionsRenderer";

import { JoinAnalysisSection } from "./JoinAnalysisSection";

type JoinAnalysisSectionsProps = {
  lens: InspectorLens;
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const JoinAnalysisSections = ({
  lens,
  sections,
  cardsBySection,
  alerts,
  drillLenses,
  onStatsReady,
  onDrill,
}: JoinAnalysisSectionsProps) => {
  return (
    <SectionsRenderer sections={sections} cardsBySection={cardsBySection}>
      {(cards) => (
        <JoinAnalysisSection
          lens={lens}
          cards={cards}
          alerts={alerts}
          drillLenses={drillLenses}
          onStatsReady={onStatsReady}
          onDrill={onDrill}
        />
      )}
    </SectionsRenderer>
  );
};
