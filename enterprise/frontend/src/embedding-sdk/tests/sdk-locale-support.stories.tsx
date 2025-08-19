import { ComponentProvider } from "embedding-sdk/components/public/ComponentProvider";
import { StaticDashboard } from "embedding-sdk/components/public/dashboard";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";

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
