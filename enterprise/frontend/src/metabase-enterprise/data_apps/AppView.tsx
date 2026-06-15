import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ErrorDetails } from "metabase/common/components/ErrorDetails/ErrorDetails";
import { GenericError, NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { Box, Flex } from "metabase/ui";
import { useGetDataAppQuery } from "metabase-enterprise/api";

import S from "./AppView.module.css";
import {
  DATA_APP_ERROR_MESSAGE_TYPE,
  type DataAppBundleErrorMessage,
} from "./constants";
import { attachIframeUrlMirror } from "./lib/attach-iframe-url-mirror";
import { deriveIframeSrc } from "./lib/derive-iframe-src";

interface AppViewProps {
  params: { name: string };
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

  // The iframe is blank until its document + bundles finish downloading (the
  // in-iframe `BundleHost` loader only appears once its React app mounts), so we
  // cover it with a loader here until its `load` event fires.
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Errors that happen *inside* the iframe (bundle fetch failed, or the bundle
  // crashed at runtime) are reported up to here via `postMessage` so we can
  // render the failure screen in the host realm — where it matches the rest of
  // the app's theme exactly, instead of fighting the SDK theme inside the frame.
  const [bundleError, setBundleError] =
    useState<DataAppBundleErrorMessage | null>(null);

  // Reset whenever we navigate to a different app so a stale error doesn't stick.
  // Note: this currently is not possible, but may happen if we show apps in the left nav menu
  useEffect(() => setBundleError(null), [name]);

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
      setIframeLoaded(true);
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

  useEffect(() => {
    if (!iframeEl) {
      return undefined;
    }

    const onMessage = (event: MessageEvent) => {
      // Only trust messages from our own iframe
      if (event.source !== iframeEl.contentWindow) {
        return;
      }

      const data = event.data as Partial<DataAppBundleErrorMessage> | null;

      if (data?.type === DATA_APP_ERROR_MESSAGE_TYPE) {
        setBundleError({
          type: DATA_APP_ERROR_MESSAGE_TYPE,
          notReady: Boolean(data.notReady),
          message: typeof data.message === "string" ? data.message : undefined,
          stack: typeof data.stack === "string" ? data.stack : undefined,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeEl]);

  if (!validName) {
    return (
      <NotFound
        title={t`Data app not found`}
        message={t`This data app doesn’t exist or has been disabled.`}
      />
    );
  }

  if (metaLoading || (!meta && !metaError)) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (metaError || !meta) {
    // A disabled or non-existent app 404s from the metadata endpoint; anything
    // else is an unexpected failure.
    const status =
      metaError && typeof metaError === "object" && "status" in metaError
        ? (metaError as { status?: unknown }).status
        : undefined;

    if (!metaError || status === 404) {
      return (
        <NotFound
          title={t`Data app not found`}
          message={t`This data app doesn’t exist or has been disabled.`}
        />
      );
    }

    return (
      <GenericError
        title={t`Couldn’t load this data app`}
        message={t`We ran into an error loading this data app. Try refreshing the page, or go back.`}
        details={metaError}
      />
    );
  }

  if (bundleError) {
    if (bundleError.notReady) {
      return (
        <NotFound
          title={t`This data app isn’t ready yet`}
          message={t`Its bundle hasn’t finished syncing from the connected repository. Try again in a moment.`}
        />
      );
    }

    return (
      <Flex
        direction="column"
        w="100%"
        h="100%"
        justify="center"
        align="center"
      >
        <EmptyState
          title={t`This data app couldn’t be loaded`}
          message={
            bundleError.message ||
            t`Something went wrong while loading this app. Try refreshing the page.`
          }
          illustrationElement={
            <div
              className={cx(
                QueryBuilderS.QueryErrorImage,
                QueryBuilderS.QueryErrorImageServerError,
              )}
            />
          }
        />

        <ErrorDetails
          className={CS.pt2}
          errorBoxClassName={S.stackTrace}
          details={bundleError.stack}
        />
      </Flex>
    );
  }

  return (
    <Box pos="relative" h="100%">
      {!iframeLoaded && (
        <Box pos="absolute" style={{ inset: 0, zIndex: 1 }}>
          <LoadingAndErrorWrapper loading />
        </Box>
      )}

      <iframe
        ref={setIframeEl}
        title={meta.display_name}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </Box>
  );
}
