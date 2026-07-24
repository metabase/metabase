import type * as React from "react";

import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";
import type { SdkErrorComponent } from "metabase/embedding-sdk/types/error-component";

// The MetabaseProvider props a data app may customize.
export const DATA_APP_PROVIDER_PROP_KEYS = [
  "theme",
  "allowedCustomVisualizations",
  "errorComponent",
] as const satisfies readonly (keyof DataAppMetabaseProviderProps)[];

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

/**
 * The slice of the sandbox's realm the network wrappers touch: the native
 * `fetch`/`XMLHttpRequest` they wrap, and the location a relative request URL
 * resolves against. A real `Window & typeof globalThis` satisfies it.
 */
export interface SandboxRealm {
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  location: { href: string; origin: string };
}

export interface SandboxBlockedNetworkInfo {
  api: "fetch" | "xhr";
  url: string;
  reason: string;
}

export type SandboxBlockedNetworkListener = (
  info: SandboxBlockedNetworkInfo,
) => void;

export type SandboxBlockedEvent =
  | { type: "api"; message: string }
  | ({ type: "network" } & SandboxBlockedNetworkInfo);

export type SandboxBlockedListener = (event: SandboxBlockedEvent) => void;
