import type { StoryFn } from "@storybook/react-webpack5";
import { type JSXElementConstructor, useState } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type {
  CreateDashboardValues,
  MetabaseDashboard,
} from "embedding-sdk-bundle/types/dashboard";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import { Box, Button } from "metabase/ui";

import { useCreateDashboardApi } from "./use-create-dashboard-api";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/use-create-dashboard-api",
  decorators: [getHostedBundleStoryDecorator()],
};

const HookTemplate: StoryFn<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const [dashboard, setDashboard] = useState<MetabaseDashboard | null>(null);
  const result = useCreateDashboardApi();

  const props: CreateDashboardValues = {
    name: "Test",
    description: null,
    collectionId: "root",
  };

  const handleDashboardCreate = async () => {
    if (!result) {
      return;
    }

    const dashboard = await result.createDashboard(props);

    setDashboard(dashboard);
  };

  if (dashboard) {
    return <div>Created empty dashboard {dashboard.id}</div>;
  }

  return (
    <MetabaseProvider authConfig={config}>
      <Box p="md">
        <Button disabled={!result} onClick={handleDashboardCreate}>
          Create dashboard
        </Button>
      </Box>
    </MetabaseProvider>
  );
};

export const Default = {
  render: HookTemplate,
};
