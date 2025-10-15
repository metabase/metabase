import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";

export default {
  title: "EmbeddingSDK/Locale",
};

export const DeLocale = () => (
  <ComponentProvider authConfig={storybookSdkAuthDefaultConfig} locale="de">
    <StaticDashboard
      dashboardId={(window as any).DASHBOARD_ID || 1}
      withDownloads
    />
  </ComponentProvider>
);
