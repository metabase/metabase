import { useLayoutEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { isEqual, omit } from "underscore";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper/SdkError";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/store/auth";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
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

interface DataAppFrameProps extends Omit<DataAppProps, "path"> {
  path: string;
  origin: string;

  /**
   * The URL the iframe first loads.
   *
   * Later values are ignored, so a route change does not reload the app.
   * `DataApp` keys this component by the app slug and instance URL, so it remounts when either changes.
   * When only the route or query changes, the new `path` is sent to the iframe, which navigates client-side.
   */
  initialSrc: string;

  locale?: string;
  store: SdkStore;
  authConfig: MetabaseAuthConfig;
}

export function DataAppFrame({
  path,
  origin,
  initialSrc,
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

  // An error belongs to the path it happened on, so a route change loads the iframe again.
  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);

  const error = failure?.path === path ? failure.message : null;

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
          path,
          instanceUrl: authConfig.metabaseInstanceUrl,
          locale,
          _embedReferrer: window.location.href,
        },
      });

    const authenticate = async () => {
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
            sendSettings();
          })
          .with({ type: "metabase.embed.requestSessionToken" }, () => {
            authenticate();
          })
          .with({ type: "metabase.embed.handleLink" }, ({ data }) => {
            send({
              type: "metabase.embed.handleLinkResponse",
              data: { requestId: data.requestId, handled: false },
            });
          })
          .otherwise(() => undefined),
    });

    if (readyRef.current) {
      sendSettings();
    }

    return removeMessageListener;
  }, [origin, path, authConfig, store, locale, error]);

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
