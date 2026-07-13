import { MetabaseProvider } from "enterprise/frontend/src/embedding-sdk-package/components/public/MetabaseProvider/MetabaseProvider";
import type { MetabaseProviderProps } from "frontend/src/embedding-sdk-bundle/types/metabase-provider";
import { ensureMetabaseProviderPropsStore } from "frontend/src/embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { once } from "underscore";

const registerDataAppDevContext = once((appSlug: string) => {
  ensureMetabaseProviderPropsStore().updateInternalProps({
    dataApp: { name: appSlug, isDev: true },
  });
});

export type DataAppDevProviderProps = MetabaseProviderProps & {
  /** The app slug from `data_app.yml` — the app's URL identity (`/apps/:slug`). */
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
