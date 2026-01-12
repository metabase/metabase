import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentProps } from "react";

import { EmbedHomepageView } from "./EmbedHomepageView";

type Args = ComponentProps<typeof EmbedHomepageView> & {
  hasExampleDashboard: boolean;
};

const meta: Meta<Args> = {
  title: "App/FEATURES/EmbedHomepage",
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
  render: (args) => {
    return (
      <EmbedHomepageView
        {...args}
        exampleDashboardId={args.hasExampleDashboard ? 1 : null}
      />
    );
  },
  args: {
    hasExampleDashboard: true,
    variant: "ee",
    hasEmbeddingFeature: false,
    embeddingDocsUrl:
      "https://www.metabase.com/docs/latest/embedding/start.html",
    analyticsDocsUrl:
      "https://www.metabase.com/learn/customer-facing-analytics/",
  },
};
