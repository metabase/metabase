import { Stack, Text, Title } from "metabase/ui";
import type { InspectorCard, InspectorSection } from "metabase-types/api";

type SectionsRendererProps = {
  sections: InspectorSection[];
  cardsBySection: Record<string, InspectorCard[]>;
  children: (
    cards: InspectorCard[],
    section: InspectorSection,
  ) => React.ReactNode;
};

export const SectionsRenderer = ({
  sections,
  cardsBySection,
  children,
}: SectionsRendererProps) =>
  sections.map((section) => {
    const cards = cardsBySection[section.id] ?? [];
    if (cards.length === 0) {
      return null;
    }
    return (
      <Stack key={section.id} gap="md">
        <Title order={3}>{section.title}</Title>
        {section.description && (
          <Text c="text-secondary">{section.description}</Text>
        )}
        {children(cards, section)}
      </Stack>
    );
  });
