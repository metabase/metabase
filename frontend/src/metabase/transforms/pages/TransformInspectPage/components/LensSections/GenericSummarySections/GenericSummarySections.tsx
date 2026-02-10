import type {
  InspectorCard,
  InspectorSection,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

import { GenericSummarySection } from "./GenericSummarySection";

type GenericSummarySectionsProps = {
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
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
