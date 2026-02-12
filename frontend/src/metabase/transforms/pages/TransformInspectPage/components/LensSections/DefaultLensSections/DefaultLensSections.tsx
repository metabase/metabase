import { match } from "ts-pattern";

import { Box, Stack, Title } from "metabase/ui";
import type {
  InspectorCard,
  InspectorSection,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import { ComparisonLayout } from "./components/ComparisonLayout/ComparisonLayout";
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
}: DefaultLensSectionsProps) => {
  return (
    <Box>
      {sections.map((section) => {
        const cards = cardsBySection[section.id] ?? [];

        if (cards.length === 0) {
          return null;
        }

        const content = match(section.layout ?? "flat")
          .with("comparison", () => (
            <ComparisonLayout
              cards={cards}
              sources={sources}
              visitedFields={visitedFields}
            />
          ))
          .with("flat", () => <FlatLayout cards={cards} />)
          .exhaustive();

        return (
          <Stack key={section.id} gap="md">
            <Title order={3}>{section.title}</Title>
            {content}
          </Stack>
        );
      })}
    </Box>
  );
};
