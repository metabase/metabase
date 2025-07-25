import type { StoryFn } from "@storybook/react";
import { useEffect, useRef } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { MetabaseDashboard } from "embedding-sdk/types/dashboard";

import "../metabase-provider.web-component";
import "./create-dashboard-modal.web-component";
import type { CreateDashboardModalWebComponentProps } from "./create-dashboard-modal.web-component";

const COLLECTION_ID = "root";
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

(window as any).onDashboardCreate = (dashboard: MetabaseDashboard) => {
  // eslint-disable-next-line no-console
  console.log(dashboard);
};

export default {
  title: "EmbeddingSDK/CreateDashboardModal/web-component",
  component: "create-dashboard-modal",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <metabase-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </metabase-provider>
    ),
  ],
};
export const CollectionBrowser = () => (
  <create-dashboard-modal
    initial-collection-id={COLLECTION_ID}
    on-create="onDashboardCreate"
  />
);

export const CollectionBrowserWithDefinedProperties = () => {
  const ref = useRef<HTMLElement & CreateDashboardModalWebComponentProps>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.onCreate = (window as any).onDashboardCreate;
  }, []);

  return (
    <create-dashboard-modal ref={ref} initial-collection-id={COLLECTION_ID} />
  );
};
