import type {
  InspectorCard,
  InspectorLens,
  InspectorSection,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import type { CardStats } from "../../../types";
import { SectionsRenderer } from "../SectionsRenderer";

import { GenericSummarySection } from "./GenericSummarySection";

type GenericSummarySectionsProps = {
  lens: InspectorLens;
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const GenericSummarySections = ({
  lens,
  sections,
  cardsBySection,
  sources,
  target,
  onStatsReady,
}: GenericSummarySectionsProps) => (
  <SectionsRenderer sections={sections} cardsBySection={cardsBySection}>
    {(cards) => (
      <GenericSummarySection
        lens={lens}
        cards={cards}
        sources={sources}
        target={target}
        onStatsReady={onStatsReady}
      />
    )}
  </SectionsRenderer>
);
