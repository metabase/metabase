import type { StaticDashboardProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const StaticDashboard = (props: StaticDashboardProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.StaticDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
