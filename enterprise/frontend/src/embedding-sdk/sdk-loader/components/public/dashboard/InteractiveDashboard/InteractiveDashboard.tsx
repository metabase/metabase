import type { InteractiveDashboardProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const InteractiveDashboard = (props: InteractiveDashboardProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.InteractiveDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
