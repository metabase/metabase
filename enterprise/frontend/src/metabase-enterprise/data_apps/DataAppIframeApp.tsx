import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { Center, Loader } from "metabase/ui";
import { color } from "metabase/ui/colors";

import { DataAppProvider } from "./components/DataAppProvider";
import { type ErrorDetail, describeError } from "./lib/describe-error";
import { readNameFromUrl } from "./lib/read-name-from-url";
import { reportErrorToParent } from "./lib/report-error-to-parent";
import { useDataAppBundle } from "./lib/use-data-app-bundle";

/**
 * Catches errors thrown while *rendering* the bundle's React tree (the async
 * fetch/instantiate failures are handled separately in `useDataAppBundle`).
 * Without this, a throw inside the bundle — e.g. an opaque `#<Object>` from the
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

/**
 * Fetches + sandboxes the bundle (via `useDataAppBundle`), then wraps the
 * resulting component with `DataAppProvider` (host-realm Redux store, SDK
 * theme, portal container, Emotion cache).
 *
 * `DataAppProvider` lives here in host code (not inside the bundle), so the
 * SDK's `setState`-via-listener paths (drill popups, plugin init, etc.) run in
 * host realm and don't hit the React-18-batching-through-Near-Membrane bug. The
 * bundle's `App.tsx` returns pure content; the factory passes the theme through
 * as `{ component, theme }`.
 */
function BundleHost({ name }: { name: string }) {
  const { data, failed } = useDataAppBundle(name);

  // On failure we report the error up to the host `AppView` (see
  // `reportErrorToParent`), which renders the themed failure screen in its own
  // realm and unmounts this iframe. Until that handoff lands we show a neutral
  // loader — never an in-frame error screen, which would flash mis-themed.
  let content: ReactNode;
  if (data && !failed) {
    const AppComponent = data.component;
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

  return (
    <DataAppProvider providerProps={data?.providerProps}>
      {content}
    </DataAppProvider>
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

  if (!name) {
    return (
      <div style={{ padding: 16, color: color("error") }}>
        {t`Missing data-app name in URL`}
      </div>
    );
  }

  return <BundleHost name={name} />;
};
