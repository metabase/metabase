import type { StoryFn } from "@storybook/react-webpack5";

import { ExternalLink } from "./ExternalLink";

export default {
  title: "Components/Ask Before Using/ExternalLink",
  component: ExternalLink,
};

const Template: StoryFn<typeof ExternalLink> = (args) => {
  return <ExternalLink {...args} />;
};

export const Default = {
  render: Template,

  args: {
    href: "/",
    children: "Link",
  },
};
