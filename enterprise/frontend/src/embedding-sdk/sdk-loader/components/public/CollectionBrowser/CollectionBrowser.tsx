import type { CollectionBrowserProps } from "embedding-sdk/components/public";

export const CollectionBrowser = (props: CollectionBrowserProps) => {
  const Component = window.MetabaseEmbeddingSDK?.CollectionBrowser;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
