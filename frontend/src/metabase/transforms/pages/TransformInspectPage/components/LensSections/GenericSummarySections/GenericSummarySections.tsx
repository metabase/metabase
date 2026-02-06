import type {
  InspectorCard,
  InspectorLens,
  InspectorSection,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import type { CardStats } from "../../../types";

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
}: GenericSummarySectionsProps) =>
  sections.map((section) => {
    const cards = cardsBySection[section.id];
    return (
      <GenericSummarySection
        key={section.id}
        lens={lens}
        cards={cards}
        sources={sources}
        target={target}
        onStatsReady={onStatsReady}
      />
    );
  });
