import {
  MetabaseProvider,
  StaticDashboard,
} from "embedding-sdk/components/public";
import { storybookSdkDefaultConfig } from "embedding-sdk/test/CommonSdkStoryWrapper";

export default {
  title: "EmbeddingSDK/Locale",
};

export const DeLocale = () => (
  <MetabaseProvider config={storybookSdkDefaultConfig} locale="de">
    <StaticDashboard dashboardId={(window as any).DASHBOARD_ID || 1} />
  </MetabaseProvider>
);
