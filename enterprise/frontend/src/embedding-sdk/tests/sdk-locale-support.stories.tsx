import {
  ComponentProvider,
  StaticDashboard,
} from "embedding-sdk/components/public";
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
