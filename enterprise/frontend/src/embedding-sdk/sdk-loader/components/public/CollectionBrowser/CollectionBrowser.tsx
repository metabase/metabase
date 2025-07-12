import type { CollectionBrowserProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const CollectionBrowser = (props: CollectionBrowserProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.CollectionBrowser;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
