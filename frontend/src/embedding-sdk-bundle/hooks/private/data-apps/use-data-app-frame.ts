import { useLayoutEffect, useRef, useState } from "react";
import { P, match } from "ts-pattern";
import { isEqual, omit } from "underscore";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/store/auth";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { listenForIframeMessages } from "embedding-sdk-shared/lib/listen-for-iframe-messages";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { getErrorMessage } from "metabase/api/utils/errors";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";

import { useDataAppFrameNavigation } from "./use-data-app-frame-navigation";

type Options = {
  path: string;
  slug: string;
  isPathControlled: boolean;
  origin: string;
  initialSrc: string;
  onPathChange: ((path: string) => void) | undefined;
  locale: string | undefined;
  store: SdkStore;
  authConfig: MetabaseAuthConfig;
};

/**
 * Runs the data app iframe: settings, authentication, errors and path sync.
 *
 * Returns the iframe's ref and `src`, or the error to show instead of it.
 */
export function useDataAppFrame({
  path,
  slug,
  isPathControlled,
  origin,
  initialSrc,
  onPathChange,
  locale,
  store,
  authConfig,
}: Options) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef(initialSrc);
  const currentAuthRef = useRef({ authConfig, store });
  const pathRef = useRef(path);

  const navigation = useDataAppFrameNavigation({
    iframeRef,
    origin,
    slug,
    initialPath: path,
    isPathControlled,
    onPathChange,
  });

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
          path: navigation.initialPath,
          instanceUrl: authConfig.metabaseInstanceUrl,
          locale,
          ...(authConfig.apiKey && { apiKey: authConfig.apiKey }),
          _embedReferrer: window.location.href,
        },
      });

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
          navigation.handleIframeLost();

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
            // The settings go first, so the iframe keeps a navigation request sent after them.
            sendSettings();
            navigation.handleIframeReady(pathRef.current);
          })
          .with({ type: "metabase.embed.requestSessionToken" }, () => {
            authenticate();
          })
          .with(
            {
              type: "metabase.embed.dataAppPathChange",
              data: { path: P.string },
            },
            ({ data }) => navigation.handlePathReport(data, pathRef.current),
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
    if (navigation.isIframeReady()) {
      sendSettings();
    }

    return removeMessageListener;
  }, [origin, authConfig, store, locale, error, navigation]);

  // Runs after the effect above, so resent settings reach the iframe before a navigation request.
  useLayoutEffect(() => {
    navigation.handleHostPathChange(path, isPathControlled);
  }, [path, isPathControlled, navigation]);

  return { iframeRef, src: srcRef.current, error };
}
