import { Card, Stack, Text } from "metabase/ui";

const COMPONENTS = [
  {
    title: "Main Heading",
    slug: "h1",
  },
  {
    title: "Paragraph",
    slug: "p",
  },
  {
    title: "List",
    slug: "list",
  },
  {
    title: "Card",
    slug: "card",
  },
  {
    title: "Table",
    slug: "table",
  },
  {
    title: "Form",
    slug: "form",
  },
];

export const DataAppsComponentsList = () => {
  return (
    <Stack px="1rem">
      {COMPONENTS.map(({ title, slug }) => (
        <Card key={slug}>
          <Text fw={500}>{title}</Text>
        </Card>
      ))}
    </Stack>
  );
};
