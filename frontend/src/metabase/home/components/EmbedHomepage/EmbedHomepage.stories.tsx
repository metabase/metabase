import type { Meta, StoryObj } from "@storybook/react";

import { EmbedHomepageView } from "./EmbedHomepageView";

type Args = Omit<
  React.ComponentProps<typeof EmbedHomepageView>,
  "exampleDashboardId"
> & {
  hasExampleDashboard: boolean;
};

const meta: Meta<Args> = {
  title: "FEATURES/EmbedHomepage",
  component: EmbedHomepageView,
  parameters: {
    controls: {
      exclude: "exampleDashboardId",
    },
  },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
  render: args => {
    return (
      <EmbedHomepageView
        {...args}
        exampleDashboardId={args.hasExampleDashboard ? 1 : null}
        key={args.initialTab}
      />
    );
  },
  args: {
    embeddingAutoEnabled: true,
    hasExampleDashboard: true,
    licenseActiveAtSetup: true,
    initialTab: "interactive",
    interactiveEmbeddingQuickstartUrl:
      "https://www.metabase.com/docs/latest/embedding/interactive-embedding-quick-start-guide.html",
    embeddingDocsUrl:
      "https://www.metabase.com/docs/latest/embedding/start.html",
    analyticsDocsUrl:
      "https://www.metabase.com/learn/customer-facing-analytics/",
  },
};
