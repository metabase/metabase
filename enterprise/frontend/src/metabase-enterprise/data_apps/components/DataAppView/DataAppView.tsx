import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ErrorDetails } from "metabase/common/components/ErrorDetails/ErrorDetails";
import { GenericError, NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { useParams } from "metabase/router";
import { Box, Flex } from "metabase/ui";
import { useGetDataAppQuery } from "metabase-enterprise/api";

import {
  DATA_APP_ERROR_MESSAGE_TYPE,
  DATA_APP_LOAD_TIMEOUT_MS,
  DATA_APP_READY_MESSAGE_TYPE,
  type DataAppBundleErrorMessage,
} from "../../constants";
import { attachIframeUrlMirror } from "../../lib/attach-iframe-url-mirror";
import { deriveIframeSrc } from "../../lib/derive-iframe-src";
import { isCrossOriginError } from "../../lib/is-cross-origin-error";
import { isDataAppMessage } from "../../lib/is-data-app-message";

import S from "./DataAppView.module.css";

/**
 * /apps/:name(/*) — renders the requested data-app inside an isolated
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
export function DataAppView() {
  const { name = "" } = useParams<{ name: string }>();
  const validName = name.length > 0;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeEl, setIframeElState] = useState<HTMLIFrameElement | null>(null);
  const setIframeEl = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    setIframeElState(el);
  }, []);

  const [appReady, setAppReady] = useState(false);
  const [bundleError, setBundleError] =
    useState<DataAppBundleErrorMessage | null>(null);
  // Diagnostic string for the "Show error details" toggle; non-null once the
  // iframe fails to load (blocked / unreachable / hung), which drives the error UI.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reset whenever we navigate to a different app so a stale error/ready state
  // doesn't stick (the next app must re-earn the overlay being dropped).
  // Note: this currently is not possible, but may happen if we show apps in the left nav menu
  useEffect(() => {
    setBundleError(null);
    setAppReady(false);
    setLoadError(null);
  }, [name]);

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
      // The iframe can navigate cross-origin — a form submitting to an allowed
      // external host, or the chrome-error page from a blocked navigation — and a
      // cross-origin `contentWindow` throws on access. Mirroring only works
      // same-origin, so tear down the old mirror and skip re-attaching if so.
      try {
        detach?.();
        detach = null;

        const win = iframeEl.contentWindow;

        if (win) {
          detach = attachIframeUrlMirror(win, name);
        }
      } catch (error) {
        detach = null;
        // Expected only for a cross-origin frame; rethrow anything else so mirror
        // bugs surface.
        if (!isCrossOriginError(error)) {
          throw error;
        }
      }
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
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const iframeWindow = iframeRef.current?.contentWindow;

      // Only trust messages from our own iframe
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      const data: unknown = event.data;

      if (isDataAppMessage(data, DATA_APP_ERROR_MESSAGE_TYPE)) {
        setBundleError({
          type: DATA_APP_ERROR_MESSAGE_TYPE,
          notReady: Boolean(data.notReady),
          message: typeof data.message === "string" ? data.message : undefined,
          stack: typeof data.stack === "string" ? data.stack : undefined,
        });
        return;
      }

      if (isDataAppMessage(data, DATA_APP_READY_MESSAGE_TYPE)) {
        setAppReady(true);
      }
    };

    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The iframe can fail to load without ever posting back — blocked by a CSP
  // `frame-src` violation, unreachable, or hung — which would otherwise leave the
  // loading overlay spinning forever. Surface an error via a CSP-violation signal
  // (instant, the cross-origin misconfiguration case) and a timeout backstop.
  useEffect(() => {
    // Stop once anything resolves the wait — including a `loadError` already set
    // by the CSP signal — so the timeout can't clobber a more specific message.
    if (!validName || appReady || bundleError || loadError) {
      return undefined;
    }

    const onViolation = (event: SecurityPolicyViolationEvent) => {
      if (
        event.effectiveDirective.startsWith("frame-src") &&
        event.blockedURI.startsWith(window.location.origin)
      ) {
        setLoadError(
          t`Frame ${event.blockedURI} was blocked by the browser’s content security policy.`,
        );
      }
    };

    document.addEventListener("securitypolicyviolation", onViolation);

    const timer = window.setTimeout(
      () =>
        setLoadError(
          t`The data app didn’t load within ${DATA_APP_LOAD_TIMEOUT_MS / 1000} seconds. The frame may be unreachable.`,
        ),
      DATA_APP_LOAD_TIMEOUT_MS,
    );

    return () => {
      document.removeEventListener("securitypolicyviolation", onViolation);
      window.clearTimeout(timer);
    };
  }, [validName, appReady, bundleError, loadError]);

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
        ? metaError.status
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

  if (loadError) {
    return (
      <GenericError
        title={t`Couldn’t load this data app`}
        message={t`This data app didn’t load. It may have been blocked or is unreachable. Try refreshing the page, or go back.`}
        details={loadError}
      />
    );
  }

  return (
    <Box pos="relative" h="100%">
      {!appReady && (
        <Box
          pos="absolute"
          bg="background-primary"
          style={{ inset: 0, zIndex: 1 }}
        >
          <LoadingAndErrorWrapper loading data-testid="data-app-loading" />
        </Box>
      )}

      {/*
        `allow-forms` is enabled so native form submissions can reach the app's
        declared `allowed_hosts`. The CSP `form-action` directive (see the data-app
        CSP in `security.clj` / the dev server) restricts submissions to exactly
        those hosts — with no `allowed_hosts` it is `'none'` — blocking any other
        target. Client-side `<form onSubmit>` (preventDefault) is unaffected.
      */}
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
