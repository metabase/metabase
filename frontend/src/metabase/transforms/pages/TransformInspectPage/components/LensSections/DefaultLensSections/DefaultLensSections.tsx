import { match } from "ts-pattern";

import type {
  InspectorCard,
  InspectorSection,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import { SectionsRenderer } from "../SectionsRenderer";

import { ComparisonLayout } from "./components/ComparisonLayout";
import { FlatLayout } from "./components/FlatLayout";

type DefaultLensSectionsProps = {
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  sources: TransformInspectSource[];
  visitedFields?: TransformInspectVisitedFields;
};

export const DefaultLensSections = ({
  sections,
  cardsBySection,
  sources,
  visitedFields,
}: DefaultLensSectionsProps) => (
  <SectionsRenderer sections={sections} cardsBySection={cardsBySection}>
    {(cards: InspectorCard[], section: InspectorSection) =>
      match(section.layout ?? "flat")
        .with("comparison", () => (
          <ComparisonLayout
            cards={cards}
            sources={sources}
            visitedFields={visitedFields}
          />
        ))
        .with("flat", () => <FlatLayout cards={cards} />)
        .exhaustive()
    }
  </SectionsRenderer>
);
