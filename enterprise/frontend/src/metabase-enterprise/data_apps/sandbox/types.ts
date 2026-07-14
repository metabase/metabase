import type * as React from "react";

import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";
import type { SdkErrorComponent } from "metabase/embedding-sdk/types/error-component";

// The MetabaseProvider props a data app may customize.
export const DATA_APP_PROVIDER_PROP_KEYS = [
  "theme",
  "allowedCustomVisualizations",
  "errorComponent",
] as const satisfies readonly (keyof DataAppMetabaseProviderProps)[];

/**
 * Structural mirror of the `MetabaseProviderProps` subset a data app may
 * customize. Declared here (not as a `Pick` of the bundle type) so this
 * contract has no app-tier dependency; keep it in sync with
 * `MetabaseProviderProps` by hand until the props move to a shared tier.
 */
export type DataAppMetabaseProviderProps = {
  theme?: MetabaseEmbeddingTheme;
  allowedCustomVisualizations?: `custom:${string}`[];
  errorComponent?: SdkErrorComponent;
};

/**
 * The bundle's factory returns:
 *   - `component` — the React tree the host will mount inside its
 *     `DataAppProvider`. Should be pure content; no `<MetabaseProvider>`
 *     inside — the host owns the provider wrap so the SDK store/theme/
 *     portal context live in host realm.
 *   - `providerProps` — the `MetabaseProvider` props the data app wants to
 *     customize (theme, allowedCustomVisualizations, errorComponent).
 */
export type DataAppFactory = () => {
  component: React.ComponentType<Record<string, unknown>>;
  providerProps?: DataAppMetabaseProviderProps;
};
