import type { PropsWithChildren } from "react";

import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";

/**
 * The bundle's theme provider, reached through the bundle global rather than
 * imported: the package and the bundle are separate builds, so a static import
 * would inline a second copy along with its React context.
 *
 * Renders children untouched until the bundle has loaded, so a consumer never
 * waits on the theme to see its own markup.
 */
export const SdkThemeProvider = ({
  theme,
  children,
}: PropsWithChildren<{ theme?: MetabaseEmbeddingTheme }>) => {
  const BundleSdkThemeProvider =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.SdkThemeProvider;

  if (!BundleSdkThemeProvider) {
    return <>{children}</>;
  }

  return (
    <BundleSdkThemeProvider theme={theme}>{children}</BundleSdkThemeProvider>
  );
};
