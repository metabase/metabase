import type { MetabaseProviderProps } from "embedding-sdk/components/public";

import { SdkLoader } from "../../private/SdkLoader";

const MetabaseProviderInternal = (props: MetabaseProviderProps) => {
  const Component = window.MetabaseEmbeddingSDK?.MetabaseProvider;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};

export const MetabaseProvider = (props: MetabaseProviderProps) => (
  <SdkLoader>
    <MetabaseProviderInternal {...props} />
  </SdkLoader>
);
