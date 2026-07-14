import { once } from "underscore";

import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider/MetabaseProvider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

const registerDataAppDevContext = once((appSlug: string) => {
  ensureMetabaseProviderPropsStore().updateInternalProps({
    dataApp: { name: appSlug, isDev: true },
  });
});

export type DataAppDevProviderProps = MetabaseProviderProps & {
  appSlug: string;
};

/**
 * Provider for the data-app local dev preview (`npm run dev`). Wraps
 * `MetabaseProvider` and reports the page's traffic as the data app, so query
 * executions are attributed to the app (as "data-app-preview") instead of the
 * React SDK.
 *
 * Only works on the local Vite dev server; throws elsewhere so it can't ship
 * in place of `MetabaseProvider`.
 */
export const DataAppDevProvider = ({
  appSlug,
  children,
  ...props
}: DataAppDevProviderProps) => {
  registerDataAppDevContext(appSlug);

  return <MetabaseProvider {...props}>{children}</MetabaseProvider>;
};
