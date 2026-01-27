import type { StoryFn } from "@storybook/react";

import { EntityMenu } from "./EntityMenu";

export default {
  title: "Deprecated/Components/Entity Menu",
  component: EntityMenu,
};

const Template: StoryFn<typeof EntityMenu> = (args) => {
  return <EntityMenu {...args} />;
};

const items = [
  {
    icon: "link",
    title: "Option 1 - External link",
    link: "https://google.com",
    externalLink: true,
  },
  {
    icon: "link",
    title: "Option 2 - Relative link",
    link: "/",
  },
  {
    icon: "bolt",
    title: "Option 3 - Action",
    action: () => alert("Yo"),
  },
];

export const Default = {
  render: Template,

  args: {
    items,
    trigger: <span>Click Me</span>,
  },
};
