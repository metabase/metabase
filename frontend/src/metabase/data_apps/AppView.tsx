import createCache from "@emotion/cache";
// eslint-disable-next-line no-restricted-imports
import { CacheProvider } from "@emotion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "ttag";

import { useGetDataAppQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Text } from "metabase/ui";
import { getCspNonce } from "metabase/utils/csp";

import { fetchDataAppBundleCode, instantiateDataAppBundle } from "./loader";

interface AppViewProps {
  params: { name: string };
}

/**
 * Minimal iframe document. The `<head>`/CSS-reset/`#root` shell here MUST
 * stay byte-for-byte equivalent to the dev-preview `index.html` that the
 * `create-data-app` skill writes (charset / viewport / `lang` / CSS reset
 * / font-family) so a bundle author iterating against the Vite dev
 * preview sees the same baseline they'll get in this production iframe.
 *
 * Differences from the dev-preview template:
 *   - `<title>` is set per-bundle on the parent's `<iframe title>` instead.
 *   - No `<script src="/src/dev.tsx">` — the dev preview boots itself, but
 *     the production iframe is mounted from the parent: `AppView` evaluates
 *     the bundle via Near Membrane bound to this window and `createRoot`s
 *     into `#root` from outside the frame.
 *
 * No Metabase main-app stylesheets, no Mantine theme. SDK components
 * rendered into the iframe inject their own `<style>` tags via Emotion /
 * Mantine `ownerDocument` detection — they land in this document's
 * `<head>`, not the host page's.
 */
/**
 * `srcdoc` iframes inherit the embedder's Content-Security-Policy. Metabase
 * runs with `style-src 'self' 'nonce-…'` (no `unsafe-inline`), so any inline
 * `<style>` we drop into the srcdoc gets dropped on the floor unless the
 * nonce attribute matches. We build the srcdoc lazily per-mount so we can
 * stamp the current page's nonce on the baseline style tag.
 */
function buildIframeSrcdoc(nonce: string) {
  // Nonce is generated server-side and is a base64-ish string; it has no
  // characters that need HTML-escaping. Guarded anyway.
  const safeNonce = nonce.replace(/[^A-Za-z0-9+/=_-]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="${safeNonce}">
      html, body, #root { height: 100%; margin: 0; }
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    </style>
  </head>
  <body><div id="root"></div></body>
</html>`;
}

/**
 * /app/:name — render the requested data-app inside an isolated iframe.
 *
 * The iframe is same-origin and `srcdoc`-driven, so it has no Metabase
 * main-app CSS or JS in scope; auth still works because cookies cross the
 * same-origin frame boundary. The Near Membrane sandbox is created against
 * the iframe's `contentWindow`, so the bundle's DOM mutations and any
 * style-tag injection happen in the iframe's document — leaving the host
 * page entirely undisturbed.
 *
 * Routing (parent ↔ iframe sub-route sync) is deliberately not handled
 * here yet; the iframe is a single-page mount and any in-app navigation
 * the bundle does today still happens inside it.
 */
export function AppView({ params }: AppViewProps) {
  const name = params.name;
  const validName = typeof name === "string" && name.length > 0;

  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useGetDataAppQuery(name, { skip: !validName });

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const srcDoc = useMemo(() => buildIframeSrcdoc(getCspNonce() ?? ""), []);

  // Fetch the bundle source and mount it inside the iframe whenever the
  // metadata changes (new upload → new `bundle_hash` → re-mount). The
  // effect awaits both the network response and the iframe being ready
  // before instantiating the sandbox.
  useEffect(() => {
    if (!validName || !meta) {
      return undefined;
    }
    let cancelled = false;
    setBundleError(null);

    const waitForIframe = (iframe: HTMLIFrameElement) =>
      new Promise<void>((resolve) => {
        const doc = iframe.contentDocument;
        if (doc && doc.readyState === "complete") {
          resolve();
          return;
        }
        iframe.addEventListener("load", () => resolve(), { once: true });
      });

    const mount = async () => {
      const iframe = iframeRef.current;
      if (!iframe) {
        return;
      }
      const [code] = await Promise.all([
        fetchDataAppBundleCode(name),
        waitForIframe(iframe),
      ]);
      if (cancelled) {
        return;
      }

      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      const rootEl = doc?.getElementById("root");
      if (!win || !doc || !rootEl) {
        throw new Error("Iframe document is not ready");
      }

      const { component: AppComponent } = instantiateDataAppBundle(
        code,
        meta.id,
        win,
      );
      // Emotion's default cache injects nonce-less `<style>` tags into the
      // host document, which our same-origin iframe inherits a strict
      // `style-src 'self' 'nonce-…'` CSP from. Give it a cache that (a)
      // targets the iframe's `<head>` and (b) stamps the parent's nonce on
      // every generated style tag so they survive CSP.
      const iframeEmotionCache = createCache({
        key: "data-app",
        container: doc.head,
        nonce: getCspNonce() ?? undefined,
      });
      reactRootRef.current?.unmount();
      const root = createRoot(rootEl);
      reactRootRef.current = root;
      root.render(
        <CacheProvider value={iframeEmotionCache}>
          <AppComponent />
        </CacheProvider>,
      );
    };

    mount().catch((e: unknown) => {
      if (!cancelled) {
        setBundleError(e instanceof Error ? e.message : String(e));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name, validName, meta?.bundle_hash, meta]);

  // Unmount the React tree we mounted inside the iframe on AppView teardown.
  useEffect(() => {
    return () => {
      reactRootRef.current?.unmount();
      reactRootRef.current = null;
    };
  }, []);

  if (!validName) {
    return (
      <Box p="md">
        <Text c="error">{t`Invalid data app name.`}</Text>
      </Box>
    );
  }

  if (metaLoading || (!meta && !metaError)) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (metaError || !meta) {
    return (
      <Box p="md">
        <Text c="error">{t`Data app not found.`}</Text>
      </Box>
    );
  }

  return (
    <Box style={{ height: "100%", minHeight: "100vh" }}>
      {bundleError && (
        <Text c="error" p="md">
          {t`Failed to load data app:`} {bundleError}
        </Text>
      )}

      <iframe
        ref={iframeRef}
        title={meta.display_name}
        srcDoc={srcDoc}
        // `allow-same-origin` so cookies cross the boundary and the SDK's
        // session-cookie auth works without any token relay. No
        // `allow-scripts` is harmless because we evaluate the bundle from
        // the parent via Near Membrane bound to the iframe window — we
        // don't load scripts via `<script>` tags inside the iframe.
        sandbox="allow-same-origin allow-scripts"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          minHeight: "100vh",
          border: 0,
        }}
      />
    </Box>
  );
}
