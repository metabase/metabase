import createCache from "@emotion/cache";
// eslint-disable-next-line no-restricted-imports
import { CacheProvider } from "@emotion/react";
import { type ComponentType, useEffect, useMemo, useState } from "react";

import { getCspNonce } from "metabase/utils/csp";

import { fetchDataAppBundleCode, instantiateDataAppBundle } from "./loader";

/**
 * Reads the requested data-app name from the iframe URL.
 *
 * The BE serves this iframe at `/embed/data-app/:name`. Anything that comes
 * after that segment (e.g. the future sub-route `/embed/data-app/foo/q1`)
 * is ignored for now — the bundle's own router will own internal navigation
 * when we add it.
 */
function readNameFromUrl(): string | null {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const i = segments.indexOf("data-app");

  if (i < 0 || i === segments.length - 1) {
    return null;
  }

  return decodeURIComponent(segments[i + 1] ?? "");
}

export const DataAppIframeApp = () => {
  const [AppComponent, setAppComponent] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emotionCache = useMemo(
    () =>
      createCache({
        key: "data-app",
        nonce: getCspNonce() ?? undefined,
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const name = readNameFromUrl();

    if (!name) {
      setError("Missing data-app name in URL");
      return;
    }

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
  }, []);

  if (error) {
    return <div style={{ padding: 16, color: "#b00" }}>Error: {error}</div>;
  }
  if (!AppComponent) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }
  return (
    <CacheProvider value={emotionCache}>
      <AppComponent />
    </CacheProvider>
  );
};
