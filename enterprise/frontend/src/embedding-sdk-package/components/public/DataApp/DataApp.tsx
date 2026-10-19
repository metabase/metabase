import {
  type CSSProperties,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { ClientSideOnlyWrapper } from "embedding-sdk-package/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { useMetabaseAuthStatus } from "embedding-sdk-package/hooks/public/use-metabase-auth-status";
import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";
import {
  getDataAppEmbedUrl,
  isIframeMessage,
  normalizeDataAppPath,
} from "embedding-sdk-shared/lib/data-app-embed";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";

/** @category DataApp */
export interface DataAppProps {
  /** App name and optional initial route/query, such as `/boba-hq/orders?active=true`. */
  path: string;
  className?: string;
  style?: CSSProperties;
  height?: CSSProperties["height"];
  width?: CSSProperties["width"];
}

/** Embed an existing data app in its isolated runtime using the provider's SSO session. */
export function DataApp(props: DataAppProps) {
  return (
    <ClientSideOnlyWrapper ssrFallback={null}>
      <DataAppInner {...props} />
    </ClientSideOnlyWrapper>
  );
}

function DataAppInner({ path, ...props }: DataAppProps) {
  const {
    state: {
      props: providerProps,
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();
  const loginStatus = useMetabaseAuthStatus();
  const id = useId();
  const authConfig = providerProps?.authConfig;
  const instanceUrl = authConfig?.metabaseInstanceUrl;
  const route = useMemo(() => {
    if (!instanceUrl) {
      return null;
    }

    try {
      const url = getDataAppEmbedUrl(instanceUrl, path);
      url.searchParams.set("embed-js-identifier", `react-data-app-${id}`);
      return {
        src: url.href,
        origin: url.origin,
        path: normalizeDataAppPath(path),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [instanceUrl, path, id]);

  if (authConfig?.isGuest || authConfig?.apiKey) {
    const message = "Data app embeds require SSO authentication.";
    return <div role="alert">{message}</div>;
  }

  if (route && "error" in route) {
    return <div role="alert">{route.error}</div>;
  }

  if (loginStatus?.status === "error") {
    return <div role="alert">{loginStatus.error.message}</div>;
  }

  if (
    !route ||
    !authConfig ||
    !reduxStore ||
    loginStatus?.status !== "success"
  ) {
    return null;
  }

  return (
    <DataAppFrame
      key={route.src}
      {...props}
      {...route}
      authConfig={authConfig}
      store={reduxStore}
      locale={providerProps?.locale}
    />
  );
}

interface DataAppFrameProps extends Omit<DataAppProps, "path"> {
  src: string;
  origin: string;
  path: string;
  authConfig: MetabaseAuthConfig;
  store: SdkStore;
  locale?: string;
}

function DataAppFrame({
  src,
  origin,
  path,
  authConfig,
  store,
  locale,
  height = 600,
  width = "100%",
  className,
  style,
}: DataAppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const getSession =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getDataAppSession;

  useLayoutEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe || error) {
      return;
    }

    let active = true;
    const send = (message: SdkIframeEmbedMessage) => {
      if (active) {
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
          _isLocalhost: ["localhost", "127.0.0.1", "[::1]"].includes(
            window.location.hostname,
          ),
        },
      });
    const authenticate = async () => {
      try {
        if (!getSession) {
          throw new Error(
            "This instance does not support React data app embeds.",
          );
        }

        const sessionToken = await getSession(store)(authConfig);
        send({
          type: "metabase.embed.submitSessionToken",
          data: { sessionToken },
        });
      } catch (error) {
        if (active) {
          const message =
            typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : String(error);
          setError(message);
        }
      }
    };
    const onMessage = (event: MessageEvent<SdkIframeEmbedTagMessage>) => {
      if (!isIframeMessage(event, iframe, origin)) {
        return;
      }

      if (event.data?.type === "metabase.embed.iframeReady") {
        readyRef.current = true;
        sendSettings();
      } else if (event.data?.type === "metabase.embed.requestSessionToken") {
        void authenticate();
      } else if (event.data?.type === "metabase.embed.handleLink") {
        send({
          type: "metabase.embed.handleLinkResponse",
          data: { requestId: event.data.data.requestId, handled: false },
        });
      }
    };

    window.addEventListener("message", onMessage);

    if (readyRef.current) {
      sendSettings();
    }

    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, [origin, path, authConfig, store, locale, getSession, error]);

  if (error) {
    return <div role="alert">{error}</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Data app"
      className={className}
      allow="clipboard-write"
      data-metabase-embed="true"
      style={{ border: 0, display: "block", width, height, ...style }}
    />
  );
}
