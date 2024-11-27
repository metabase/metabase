import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import {
  type ComponentProps,
  type JSXElementConstructor,
  useState,
} from "react";

import { EditableDashboard } from "embedding-sdk/components/public";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { CreateDashboardModal } from "./CreateDashboardModal";
import {
  type CreateDashboardValues,
  useCreateDashboardApi,
} from "./use-create-dashboard-api";

export default {
  title: "EmbeddingSDK/CreateDashboardModal",
  component: CreateDashboardModal,
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<ComponentProps<typeof CreateDashboardModal>> = args => (
  <CreateDashboardModal
    onClose={action("onClose")}
    onCreate={action("onCreate")}
    {...args}
  />
);

export const Default = {
  render: Template,

  args: {
    isOpen: true,
  },
};

const HookTemplate: StoryFn<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const { createDashboard } = useCreateDashboardApi();

  const props: CreateDashboardValues = {
    name: "Test",
    description: null,
    collectionId: null,
  };

  const handleDashboardCreate = async () => {
    const dashboard = await createDashboard(props);

    setDashboard(dashboard);
  };

  if (dashboard) {
    return <div>Created empty dashboard {dashboard.id}</div>;
  }

  return (
    <Box p="md">
      <Button onClick={handleDashboardCreate}>Create dashboard</Button>
    </Box>
  );
};

export const UseCreateDashboardApiHook = {
  render: HookTemplate,
};

const FullWorkflowExampleTemplate: StoryFn<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

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
