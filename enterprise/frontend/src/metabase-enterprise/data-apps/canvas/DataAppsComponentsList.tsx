import { Stack } from "metabase/ui";
import type { DataAppWidget } from "metabase-enterprise/data-apps/canvas/canvas-types";
import { SidebarComponentItem } from "metabase-enterprise/data-apps/canvas/widgets/SidebarComponentItem";

const COMPONENTS: ({ title: string } & Omit<DataAppWidget, "id">)[] = [
  {
    title: "Vertical Section",
    type: "section",
    options: {
      direction: "column",
      width: 1,
    },
    childrenIds: [],
  },
  {
    title: "Horizontal Section",
    type: "section",
    options: {
      direction: "row",
      width: 1,
    },
    childrenIds: [],
  },
  {
    title: "Text",
    type: "text",
    options: {
      text: "Hello! Some cool text here",
    },
  },
  {
    title: "Button",
    type: "button",
    options: {
      text: "New Button",
    },
  },
];

export const DataAppsComponentsList = () => {
  return (
    <Stack px="1rem">
      {COMPONENTS.map(({ title, ...widget }) => (
        <SidebarComponentItem key={title} title={title} widget={widget} />
      ))}
    </Stack>
  );
};
