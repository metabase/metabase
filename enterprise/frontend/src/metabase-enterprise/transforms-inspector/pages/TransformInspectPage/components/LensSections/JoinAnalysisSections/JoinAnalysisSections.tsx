import type {
  InspectorCard,
  InspectorSection,
  InspectorSectionId,
} from "metabase-types/api";

import { JoinAnalysisSection } from "./JoinAnalysisSection";

type JoinAnalysisSectionsProps = {
  sections: InspectorSection[];
  cardsBySection: Record<InspectorSectionId, InspectorCard[]>;
};

export const JoinAnalysisSections = ({
  sections,
  cardsBySection,
}: JoinAnalysisSectionsProps) =>
  sections.map((section) => {
    const cards = cardsBySection[section.id];
    return <JoinAnalysisSection key={section.id} cards={cards} />;
  });
