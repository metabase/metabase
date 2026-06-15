import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Center, Loader } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getCspNonce } from "metabase/utils/csp";

import { DataAppProvider } from "./components/DataAppProvider";
import { type ErrorDetail, describeError } from "./lib/describe-error";
import { readNameFromUrl } from "./lib/read-name-from-url";
import { reportErrorToParent } from "./lib/report-error-to-parent";
import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "./loader";

interface LoadedApp {
  component: ComponentType<Record<string, unknown>>;
  theme: MetabaseTheme | undefined;
}

/**
 * Catches errors thrown while *rendering* the bundle's React tree (the async
 * fetch/instantiate failures are handled separately in `BundleHost`). Without
 * this, a throw inside the bundle — e.g. an opaque `#<Object>` from the
 * Near-Membrane sandbox — unmounts the whole tree and leaves a blank iframe.
 */
class BundleErrorBoundary extends Component<
  { children: ReactNode },
  { detail: ErrorDetail | null }
> {
  state: { detail: ErrorDetail | null } = { detail: null };

  static getDerivedStateFromError(error: unknown): { detail: ErrorDetail } {
    return { detail: describeError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const detail = describeError(error);
    console.error(
      "[data-app] error rendering the bundle:",
      detail.message,
      detail.stack ?? "",
      info,
    );
    reportErrorToParent(false, detail);
  }

  render() {
    if (this.state.detail) {
      // `componentDidCatch` already reported the error to the host, which shows
      // the themed failure screen; a neutral loader covers the handoff.
      return (
        <Center h="100vh">
          <Loader />
        </Center>
      );
    }
    return this.props.children;
  }
}

interface BundleHostProps {
  name: string;
  cache: ReturnType<typeof createCache>;
}

/**
 * Fetches + sandboxes the bundle, then wraps the resulting component
 * with `DataAppProvider` (host-realm Redux store, SDK theme, portal
 * container) and renders it under the iframe-side Emotion cache.
 *
 * `DataAppProvider` lives here in host code (not inside the bundle), so
 * the SDK's `setState`-via-listener paths (drill popups, plugin init,
 * etc.) run in host realm and don't hit the React-18-batching-through-
 * Near-Membrane bug. The bundle's `App.tsx` returns pure content; the
 * factory passes the theme through as `{ component, theme }`.
 */
function BundleHost({ name, cache }: BundleHostProps) {
  const [loaded, setLoaded] = useState<LoadedApp | null>(null);
  // We don't keep the error detail in state — it's reported straight to the host
  // `AppView`, which owns the failure screen. This only gates what we render here
  // (the bundle vs. a neutral loader during the handoff).
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const code = await fetchDataAppBundleCode(name);

      if (cancelled) {
        return;
      }

      const { component, theme } = instantiateDataAppBundle(code, name, window);

      setLoaded({ component, theme });
    };

    load().catch((error: unknown) => {
      if (!cancelled) {
        const notReady =
          error instanceof DataAppBundleError && error.status === 404;
        // A 404 (not-yet-synced) is expected, so we keep the friendly message;
        // any other failure carries the real error so it can be shown.
        const detail = notReady ? undefined : describeError(error);
        setFailed(true);
        reportErrorToParent(notReady, detail);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    // The bundle runs in a Near-Membrane sandbox that can throw errors which
    // escape React's render cycle (e.g. an opaque `#<Object>` from the membrane)
    // and so slip past `BundleErrorBoundary`, leaving a blank frame. Catch
    // genuine uncaught JS errors at the window level and show the error screen.
    // `event.error == null` for resource-load errors, which we ignore.
    const onError = (event: ErrorEvent) => {
      if (event.error != null) {
        const detail = describeError(event.error, event.message);
        // Log the unpacked message/stack so devtools shows the real error
        // instead of the membrane's opaque `#<Object>`.
        console.error(
          "[data-app] uncaught error in the bundle:",
          detail.message,
          detail.stack ?? "",
        );
        setFailed(true);
        reportErrorToParent(false, detail);
      }
    };

    window.addEventListener("error", onError);

    return () => window.removeEventListener("error", onError);
  }, []);

  // On failure we report the error up to the host `AppView` (see
  // `reportErrorToParent`), which renders the themed failure screen in its own
  // realm and unmounts this iframe. Until that handoff lands we show a neutral
  // loader — never an in-frame error screen, which would flash mis-themed.
  let content: ReactNode;
  if (loaded && !failed) {
    const AppComponent = loaded.component;
    content = (
      <BundleErrorBoundary>
        <AppComponent />
      </BundleErrorBoundary>
    );
  } else {
    content = (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  // The bundle + loader render inside `DataAppProvider` so they get the SDK
  // theme and the `MantineProvider`, the same context the bundle renders in.
  return (
    <CacheProvider value={cache}>
      <DataAppProvider theme={loaded?.theme}>{content}</DataAppProvider>
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
      <div style={{ padding: 16, color: color("error") }}>
        {t`Missing data-app name in URL`}
      </div>
    );
  }

  return <BundleHost name={name} cache={emotionCache} />;
};
