import type { EditableDashboardProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const EditableDashboard = (props: EditableDashboardProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.EditableDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
