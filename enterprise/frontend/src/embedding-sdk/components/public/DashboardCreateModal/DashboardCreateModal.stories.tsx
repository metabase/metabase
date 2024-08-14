import { action } from "@storybook/addon-actions";
import type { ComponentStory } from "@storybook/react";
import { type JSXElementConstructor, useState } from "react";

import { EditableDashboard } from "embedding-sdk/components/public";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardCreateModal } from "./DashboardCreateModal";
import {
  type DashboardCreateParameters,
  useDashboardCreate,
} from "./use-dashboard-create";

// eslint-disable-next-line import/no-default-export
export default {
  title: "EmbeddingSDK/DashboardCreateModal",
  component: DashboardCreateModal,
  decorators: [CommonSdkStoryWrapper],
};

const Template: ComponentStory<typeof DashboardCreateModal> = () => {
  return (
    <DashboardCreateModal
      onClose={action("onClose")}
      onCreate={action("onCreate")}
    />
  );
};

export const Default = Template.bind({});
Template.args = {
  onClose: action("onClose"),
  onCreate: action("onCreate"),
};

const HookTemplate: ComponentStory<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const { createDashboard } = useDashboardCreate();

  const props: DashboardCreateParameters = {
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

export const Hook = HookTemplate.bind({});

const FullWorkflowExampleTemplate: ComponentStory<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  if (dashboard) {
    return <EditableDashboard dashboardId={dashboard.id} />;
  }

  return (
    <DashboardCreateModal onClose={action("onClose")} onCreate={setDashboard} />
  );
};

export const FullWorkflowExample = FullWorkflowExampleTemplate.bind({});
