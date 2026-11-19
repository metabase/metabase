import { useLayoutEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { P, match } from "ts-pattern";
import { isEqual, omit } from "underscore";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/store/auth";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";
import { listenForIframeMessages } from "embedding-sdk-shared/lib/listen-for-iframe-messages";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { getErrorMessage } from "metabase/api/utils/errors";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";

import type { DataAppProps } from "./DataApp";

// Matches metabase-data-app web component's default height
const DEFAULT_HEIGHT = 600;

interface DataAppFrameProps extends Omit<DataAppProps, "initialPath" | "path"> {
  path: string;
  slug: string;

  /** Whether the host passed `path`, so it can navigate the app. */
  isPathControlled: boolean;

  origin: string;

  /**
   * The URL the iframe first loads.
   *
   * Later values are ignored, so a route change does not reload the app.
   * `DataApp` keys this component by the app slug and instance URL, so it remounts when either changes.
   * When only the route or query changes, the iframe is asked to navigate client-side.
   */
  initialSrc: string;

  locale?: string;
  store: SdkStore;
  authConfig: MetabaseAuthConfig;
}

export function DataAppFrame({
  path,
  slug,
  isPathControlled,
  origin,
  initialSrc,
  onPathChange,
  locale,
  store,
  authConfig,
  height = DEFAULT_HEIGHT,
  width = "100%",
  className,
  style,
}: DataAppFrameProps) {
  const readyRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef(initialSrc);
  const currentAuthRef = useRef({ authConfig, store });
  const pathRef = useRef(path);

  // The path in `initialSrc`. Settings always carry it, so resending them never moves the app.
  const initialPathRef = useRef(path);

  // The page the iframe is on, as far as the host knows: the last path it reported or was asked to show.
  const iframePathRef = useRef(path);

  // Paths reported to `onPathChange` that have not come back as `path` yet. A host may apply them late,
  // after the user has moved on, so they are echoes to skip rather than pages to navigate to.
  const reportedPathsRef = useRef<string[]>([]);

  // Navigation requests are numbered, and the iframe reports the last one it handled.
  // A report with an older number was sent before the iframe handled the latest request, which moves it away.
  const navigationCountRef = useRef(0);
  const navigationIdRef = useRef<number | undefined>(undefined);

  const navigateIframeRef = useRef<(nextPath: string) => void>(() => {});

  // Refs so an inline callback does not re-send the settings on every render.
  const onPathChangeRef = useLatest(onPathChange);
  const isPathControlledRef = useLatest(isPathControlled);

  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);

  // An error belongs to the path it happened on, so a route change loads the iframe again.
  if (failure && failure.path !== path) {
    setFailure(null);
  }

  const error = failure?.path === path ? failure.message : null;

  // The slug only dedupes events per app. It is not sent to analytics.
  useTrackSdkComponentMount("DataApp", slug, {});

  // make sure auth replies cannot use stale credentials
  useLayoutEffect(() => {
    currentAuthRef.current = { authConfig, store };
  }, [authConfig, store]);

  useLayoutEffect(() => {
    pathRef.current = path;
  }, [path]);

  useLayoutEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe || error) {
      return;
    }

    const isCurrentAuthRequest = () =>
      iframeRef.current === iframe &&
      currentAuthRef.current.store === store &&
      // Let pending refreshes finish after callback updates.
      isEqual(
        omit(currentAuthRef.current.authConfig, "fetchRequestToken"),
        omit(authConfig, "fetchRequestToken"),
      );

    const send = (message: SdkIframeEmbedMessage) => {
      if (iframeRef.current === iframe) {
        iframe.contentWindow?.postMessage(message, origin);
      }
    };

    const sendSettings = () =>
      send({
        type: "metabase.embed.setSettings",
        data: {
          componentName: "metabase-data-app",
          path: initialPathRef.current,
          instanceUrl: authConfig.metabaseInstanceUrl,
          locale,
          ...(authConfig.apiKey && { apiKey: authConfig.apiKey }),
          _embedReferrer: window.location.href,
        },
      });

    const navigateIframe = (nextPath: string) => {
      iframePathRef.current = nextPath;
      reportedPathsRef.current = [];

      // Before the iframe is ready, it navigates to the host's path once it is.
      if (readyRef.current) {
        navigationCountRef.current += 1;
        navigationIdRef.current = navigationCountRef.current;

        send({
          type: "metabase.embed.navigateToDataAppPath",
          data: { path: nextPath, navigationId: navigationIdRef.current },
        });
      }
    };

    navigateIframeRef.current = navigateIframe;

    const authenticate = async () => {
      if (authConfig.apiKey) {
        return;
      }

      try {
        const sessionToken =
          await PLUGIN_EMBEDDING_SDK_AUTH.getOrRefreshSession(
            authConfig,
            store,
          );

        if (!sessionToken) {
          throw new Error("Unable to authenticate this data app.");
        }

        if (isCurrentAuthRequest()) {
          // an error from an earlier route must not come back after a retry works
          setFailure(null);

          send({
            type: "metabase.embed.submitSessionToken",
            data: { authMethod: "provider-managed", sessionToken },
          });
        }
      } catch (error) {
        if (isCurrentAuthRequest()) {
          // the next iframe sends its own ready message
          readyRef.current = false;

          setFailure({
            path: pathRef.current,
            message: getErrorMessage(error, String(error)),
          });
        }
      }
    };

    const removeMessageListener = listenForIframeMessages({
      iframe,
      expectedOrigin: origin,
      handler: (message: SdkIframeEmbedTagMessage) =>
        match(message)
          .with({ type: "metabase.embed.iframeReady" }, () => {
            readyRef.current = true;

            // A new iframe opens `initialSrc` and has handled no navigation requests yet.
            iframePathRef.current = initialPathRef.current;
            navigationIdRef.current = undefined;
            reportedPathsRef.current = [];

            sendSettings();

            if (pathRef.current !== iframePathRef.current) {
              navigateIframe(pathRef.current);
            }
          })
          .with({ type: "metabase.embed.requestSessionToken" }, () => {
            authenticate();
          })
          .with(
            {
              type: "metabase.embed.dataAppPathChange",
              data: { path: P.string },
            },
            ({ data }) => {
              // The iframe handles the latest request next, so this page is already left behind.
              if (data.navigationId !== navigationIdRef.current) {
                return;
              }

              // `path` cannot name this page, so `onPathChange={setPath}` would break the embed. Send the app
              // back to the host's path instead, or the host could not navigate to that path again.
              if (getEmbeddedAppSlugFromPath(data.path) !== slug) {
                if (isPathControlledRef.current) {
                  navigateIframe(pathRef.current);
                }

                return;
              }

              iframePathRef.current = data.path;

              if (onPathChangeRef.current) {
                if (isPathControlledRef.current) {
                  reportedPathsRef.current.push(data.path);
                }

                onPathChangeRef.current(data.path);
              }
            },
          )
          .with({ type: "metabase.embed.handleLink" }, ({ data }) => {
            send({
              type: "metabase.embed.handleLinkResponse",
              data: { requestId: data.requestId, handled: false },
            });
          })
          .otherwise(() => undefined),
    });

    // Resend the settings when the locale or auth changes.
    if (readyRef.current) {
      sendSettings();
    }

    return removeMessageListener;
  }, [
    origin,
    slug,
    authConfig,
    store,
    locale,
    error,
    onPathChangeRef,
    isPathControlledRef,
  ]);

  useLayoutEffect(() => {
    const reportedIndex = reportedPathsRef.current.indexOf(path);

    if (path === iframePathRef.current) {
      reportedPathsRef.current = [];
    } else if (reportedIndex !== -1) {
      reportedPathsRef.current.splice(0, reportedIndex + 1);
    } else {
      navigateIframeRef.current(path);
    }
  }, [path]);

  if (error) {
    return <SdkError message={error} />;
  }

  return (
    <iframe
      ref={iframeRef}
      src={srcRef.current}
      className={className}
      allow="clipboard-write"
      data-testid="data-app-frame"
      data-metabase-embed="true"
      style={{ border: 0, display: "block", width, height, ...style }}
    />
  );
}
