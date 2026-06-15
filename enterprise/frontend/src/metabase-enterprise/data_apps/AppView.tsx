import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Text } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";
import { useGetDataAppQuery } from "metabase-enterprise/api";

import { DATA_APP_EMBED_PREFIX } from "./constants";

interface AppViewProps {
  params: { name: string };
}

/**
 * Maps the parent's `/data-app/:name(/sub/route)` path to the iframe's
 * `/embed/data-app/:name(/sub/route)` path.
 *
 * The sub-path is read from `window.location.pathname` at component init
 * (it is later changed *from inside the iframe*, never from the parent's
 * own URL — we intentionally don't re-sync the parent → iframe direction
 * after initial mount). Trailing characters after the name segment are
 * preserved verbatim.
 */
function deriveIframeSrc(name: string): string {
  const prefix = `/data-app/${encodeURIComponent(name)}`;
  const path = window.location.pathname;
  const i = path.indexOf(prefix);
  const tail = i >= 0 ? path.slice(i + prefix.length) : "";
  return getSubpathSafeUrl(
    `${DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}${tail}`,
  );
}

/**
 * Mirrors the iframe's URL into the parent's URL bar (no page reload).
 *
 * Same-origin frame, so we monkey-patch the iframe's `History` methods
 * directly — no `postMessage` bridge. Wrapping `pushState`/`replaceState`
 * catches programmatic nav; `popstate` catches browser back/forward
 * inside the iframe. Each change is mirrored via the parent's
 * `replaceState` (not `pushState`) so iframe-internal navigations don't
 * clutter the parent's back-history with one entry each.
 *
 * Returns a cleanup that restores the originals.
 */
function attachIframeUrlMirror(
  iframeWindow: Window,
  parentName: string,
): () => void {
  const iframePrefix = `${DATA_APP_EMBED_PREFIX}/${encodeURIComponent(parentName)}`;
  const parentPrefix = `/data-app/${encodeURIComponent(parentName)}`;

  const mirror = () => {
    const iframePath = iframeWindow.location.pathname;
    const tail = iframePath.startsWith(iframePrefix)
      ? iframePath.slice(iframePrefix.length)
      : "";
    const parentTarget =
      parentPrefix + tail + window.location.search + window.location.hash;
    const parentCurrent =
      window.location.pathname + window.location.search + window.location.hash;
    if (parentCurrent !== parentTarget) {
      window.history.replaceState(window.history.state, "", parentTarget);
    }
  };

  const history = iframeWindow.history;
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    mirror();
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    mirror();
  };
  iframeWindow.addEventListener("popstate", mirror);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    iframeWindow.removeEventListener("popstate", mirror);
  };
}

/**
 * /data-app/:name(/*) — renders the requested data-app inside an isolated
 * iframe, mirroring the iframe's internal route into the parent's URL.
 *
 * Sync semantics:
 *   - Parent → iframe: only on initial mount. The parent's current
 *     sub-path is read once and appended to the iframe's `src`. Later
 *     parent navigations are ignored (re-mounting the iframe is what
 *     would happen, and that's both expensive and against the design).
 *   - Iframe → parent: continuous. Every `pushState` / `replaceState` /
 *     `popstate` inside the iframe updates the parent's URL via
 *     `replaceState` (no parent reload, no extra history entry).
 *
 * The data-app bundle itself knows nothing about either direction —
 * it just uses React Router as if it were the top-level app.
 */
export function AppView({ params }: AppViewProps) {
  const name = params.name;
  const validName = typeof name === "string" && name.length > 0;
  // Callback ref (vs `useRef`) — fires when the iframe element actually
  // mounts. The iframe is conditionally rendered (only after `meta`
  // resolves), so a `useEffect` keyed on `[name, validName]` alone would
  // run before the iframe exists and silently skip.
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);

  // Read parent path → iframe src ONCE; never re-derive on later renders.
  const src = useMemo(
    () => (validName ? deriveIframeSrc(name) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useGetDataAppQuery(name, { skip: !validName });

  useEffect(() => {
    if (!iframeEl || !validName) {
      return undefined;
    }
    let detach: (() => void) | null = null;

    const onLoad = () => {
      const win = iframeEl.contentWindow;
      if (!win) {
        return;
      }
      detach?.();
      detach = attachIframeUrlMirror(win, name);
    };

    iframeEl.addEventListener("load", onLoad);
    // If the iframe already loaded before the effect ran, attach now.
    if (iframeEl.contentWindow?.document.readyState === "complete") {
      onLoad();
    }

    return () => {
      iframeEl.removeEventListener("load", onLoad);
      detach?.();
    };
  }, [iframeEl, name, validName]);

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
      <iframe
        ref={setIframeEl}
        title={meta.display_name}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups"
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
