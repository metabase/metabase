import type {
  InspectorCard,
  InspectorSection,
  InspectorSectionId,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { GenericSummarySection } from "./GenericSummarySection";

type GenericSummarySectionsProps = {
  sections: InspectorSection[];
  cardsBySection: Record<InspectorSectionId, InspectorCard[]>;
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

export const GenericSummarySections = ({
  sections,
  cardsBySection,
  sources,
  target,
}: GenericSummarySectionsProps) =>
  sections.map((section) => {
    const cards = cardsBySection[section.id];
    return (
      <GenericSummarySection
        key={section.id}
        cards={cards}
        sources={sources}
        target={target}
      />
    );
  });
