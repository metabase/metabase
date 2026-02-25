import { match } from "ts-pattern";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Stack, Title } from "metabase/ui";
import type {
  InspectorCard,
  InspectorSection,
  InspectorSectionId,
  InspectorSource,
  InspectorVisitedFields,
} from "metabase-types/api";

import { ComparisonLayout } from "./components/ComparisonLayout/ComparisonLayout";
import { FlatLayout } from "./components/FlatLayout";

type DefaultLensSectionsProps = {
  sections: InspectorSection[];
  cardsBySection: Record<InspectorSectionId, InspectorCard[]>;
  sources: InspectorSource[];
  visitedFields?: InspectorVisitedFields;
};

export const DefaultLensSections = ({
  sections,
  cardsBySection,
  sources,
  visitedFields,
}: DefaultLensSectionsProps) => {
  const metadata = useSelector(getMetadata);
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
              metadata={metadata}
            />
          ))
          .with("flat", () => <FlatLayout cards={cards} metadata={metadata} />)
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
