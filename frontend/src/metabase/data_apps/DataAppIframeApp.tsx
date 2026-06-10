import createCache from "@emotion/cache";
// eslint-disable-next-line no-restricted-imports
import { CacheProvider } from "@emotion/react";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { color } from "metabase/ui/colors";
import { getCspNonce } from "metabase/utils/csp";

import { DataAppProvider } from "./components/DataAppProvider";
import { fetchDataAppBundleCode, instantiateDataAppBundle } from "./loader";

interface LoadedApp {
  component: ComponentType<Record<string, unknown>>;
  theme: MetabaseTheme | undefined;
}

/**
 * Reads the requested data-app name from the iframe URL.
 *
 * The BE serves this iframe at `/embed/data-app/:name(/sub/route)`. Anything
 * after the `:name` segment is owned by the bundle's own router and mirrored
 * back to the parent by `attachIframeUrlMirror` in `AppView`.
 */
function readNameFromUrl(): string | null {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const i = segments.indexOf("data-app");
  if (i < 0 || i === segments.length - 1) {
    return null;
  }
  return decodeURIComponent(segments[i + 1] ?? "");
}

interface BundleHostProps {
  name: string;
  cache: ReturnType<typeof createCache>;
}

/**
 * Fetches + sandboxes the bundle, then wraps the resulting component
 * with `DataAppProvider` (host-realm Redux store, SDK theme, portal
 * container) and renders it under the iframe-side Emotion cache.
 *
 * `DataAppProvider` lives here in host code (not inside the bundle), so
 * the SDK's `setState`-via-listener paths (drill popups, plugin init,
 * etc.) run in host realm and don't hit the React-18-batching-through-
 * Near-Membrane bug. The bundle's `App.tsx` returns pure content; the
 * factory passes the theme through as `{ component, theme }`.
 */
function BundleHost({ name, cache }: BundleHostProps) {
  const [loaded, setLoaded] = useState<LoadedApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const code = await fetchDataAppBundleCode(name);

      if (cancelled) {
        return;
      }

      const { component, theme } = instantiateDataAppBundle(code, name, window);

      setLoaded({ component, theme });
    };

    load().catch((e: unknown) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name]);

  if (error) {
    return (
      <div style={{ padding: 16, color: color("error") }}>
        {t`Error:`} {error}
      </div>
    );
  }

  if (!loaded) {
    return <div style={{ padding: 16 }}>{t`Loading…`}</div>;
  }

  const { component: AppComponent, theme } = loaded;

  return (
    <CacheProvider value={cache}>
      <DataAppProvider theme={theme}>
        <AppComponent />
      </DataAppProvider>
    </CacheProvider>
  );
}

/**
 * Iframe-top React app. Reads the data-app name from the URL, mounts the
 * bundle, and gets out of the way. Any sub-routes the bundle navigates to
 * (via `history.pushState`, `react-router`, etc.) are mirrored back to the
 * parent URL by `attachIframeUrlMirror` — the bundle doesn't need to know.
 */
export const DataAppIframeApp = () => {
  const name = useMemo(() => readNameFromUrl(), []);
  const emotionCache = useMemo(
    () => createCache({ key: "data-app", nonce: getCspNonce() ?? undefined }),
    [],
  );

  if (!name) {
    return (
      <div style={{ padding: 16, color: color("error") }}>
        {t`Missing data-app name in URL`}
      </div>
    );
  }

  return <BundleHost name={name} cache={emotionCache} />;
};
