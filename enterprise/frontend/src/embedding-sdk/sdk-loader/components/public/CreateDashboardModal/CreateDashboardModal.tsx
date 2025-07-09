import type { CreateDashboardModalProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const CreateDashboardModal = (props: CreateDashboardModalProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.CreateDashboardModal;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
