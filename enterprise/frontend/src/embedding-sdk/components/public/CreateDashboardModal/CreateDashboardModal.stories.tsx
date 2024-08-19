import { action } from "@storybook/addon-actions";
import type { ComponentStory } from "@storybook/react";
import { type JSXElementConstructor, useState } from "react";

import { EditableDashboard } from "embedding-sdk/components/public";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { CreateDashboardModal } from "./CreateDashboardModal";
import {
  type CreateDashboardValues,
  useCreateDashboardApi,
} from "./use-create-dashboard-api";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/CreateDashboardModal",
  component: CreateDashboardModal,
  decorators: [CommonSdkStoryWrapper],
};

const Template: ComponentStory<typeof CreateDashboardModal> = () => (
  <CreateDashboardModal
    onClose={action("onClose")}
    onCreate={action("onCreate")}
  />
);

export const Default = Template.bind({});

const HookTemplate: ComponentStory<
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

export const useCreateDashboardApiHook = HookTemplate.bind({});

const FullWorkflowExampleTemplate: ComponentStory<
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

export const FullWorkflowExample = FullWorkflowExampleTemplate.bind({});
