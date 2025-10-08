import {
  MetabaseProvider,
  StaticDashboard,
} from "embedding-sdk-bundle/components/public";
import { storybookSdkAuthDefaultConfig } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";

export default {
  title: "EmbeddingSDK/Locale",
};

export const DeLocale = () => (
  <MetabaseProvider authConfig={storybookSdkAuthDefaultConfig} locale="de">
    <StaticDashboard
      dashboardId={(window as any).DASHBOARD_ID || 1}
      withDownloads
    />
  </MetabaseProvider>
);
