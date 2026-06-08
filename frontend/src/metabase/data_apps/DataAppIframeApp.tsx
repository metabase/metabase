import createCache from "@emotion/cache";
// eslint-disable-next-line no-restricted-imports
import { CacheProvider } from "@emotion/react";
import { type ComponentType, useEffect, useMemo, useState } from "react";

import { getCspNonce } from "metabase/utils/csp";

import { fetchDataAppBundleCode, instantiateDataAppBundle } from "./loader";

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
 * Fetches + sandboxes the bundle, then renders the resulting component
 * under the iframe-side Emotion cache.
 */
function BundleHost({ name, cache }: BundleHostProps) {
  const [AppComponent, setAppComponent] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const code = await fetchDataAppBundleCode(name);
      if (cancelled) {
        return;
      }
      const { component } = instantiateDataAppBundle(code, name, window);
      setAppComponent(() => component);
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
    return <div style={{ padding: 16, color: "#b00" }}>Error: {error}</div>;
  }
  if (!AppComponent) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }
  return (
    <CacheProvider value={cache}>
      <AppComponent />
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
      <div style={{ padding: 16, color: "#b00" }}>
        Missing data-app name in URL
      </div>
    );
  }

  return <BundleHost name={name} cache={emotionCache} />;
};
