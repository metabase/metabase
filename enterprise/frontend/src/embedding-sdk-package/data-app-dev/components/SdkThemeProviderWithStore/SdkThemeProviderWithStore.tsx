import type { PropsWithChildren } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";

export const SdkThemeProviderWithStore = ({
  theme,
  children,
}: PropsWithChildren<{ theme?: MetabaseEmbeddingTheme }>) => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const BundleSdkThemeProviderWithStore =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.SdkThemeProviderWithStore;

  if (!BundleSdkThemeProviderWithStore || !reduxStore) {
    return <>{children}</>;
  }

  return (
    <BundleSdkThemeProviderWithStore store={reduxStore} theme={theme}>
      {children}
    </BundleSdkThemeProviderWithStore>
  );
};
