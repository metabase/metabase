import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import {
  type ComponentProps,
  type JSXElementConstructor,
  useState,
} from "react";

import { EditableDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { MetabaseDashboard } from "embedding-sdk-bundle/types/dashboard";

import { CreateDashboardModal } from "./CreateDashboardModal";

export default {
  title: "EmbeddingSDK/CreateDashboardModal",
  component: CreateDashboardModal,
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<ComponentProps<typeof CreateDashboardModal>> = (
  args,
) => <CreateDashboardModal {...args} />;

export const Default = {
  render: Template,

  args: {
    isOpen: true,
  },
};

const FullWorkflowExampleTemplate: StoryFn<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<MetabaseDashboard | null>(null);

  if (dashboard) {
    return <EditableDashboard dashboardId={dashboard.id} />;
  }

  return (
    <CreateDashboardModal onClose={action("onClose")} onCreate={setDashboard} />
  );
};

export const FullWorkflowExample = {
  render: FullWorkflowExampleTemplate,
};
