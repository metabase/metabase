import { Component, useRef, useState } from "react";
import type { ReactNode } from "react";

type EscapeTestEnv = {
  target: string;
  instanceUrl: string;
  payload: Record<string, unknown>;
};

type ReactMode =
  | "react-iframe-about-blank"
  | "react-iframe-src"
  | "react-iframe-srcdoc";

const getEnv = (): EscapeTestEnv => {
  const env = (globalThis as { __METABASE_DATA_APP_TEST_ENV__?: EscapeTestEnv })
    .__METABASE_DATA_APP_TEST_ENV__;

  if (!env) {
    throw new Error("escape fixture: missing test env");
  }

  return env;
};

const describeError = (err: unknown): string =>
  (err as { message?: string })?.message ?? String(err);

async function attemptPrivilegedCall(
  realm: Window,
  target: string,
  payload: unknown,
): Promise<string> {
  const res = await realm.fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return `escaped:${res.status}`;
}

type SdkMountBridge = (
  container: HTMLElement,
  ComponentProvider: unknown,
  providerProps: unknown,
  Component: unknown,
  componentProps: unknown,
) => { unmount: () => void };

const getMountBridge = (): SdkMountBridge | undefined =>
  (window as unknown as { __MB_DATA_APP_SDK_MOUNT__?: SdkMountBridge })
    .__MB_DATA_APP_SDK_MOUNT__;

const getSdkBundle = ():
  | (Record<string, unknown> & { ComponentProvider?: unknown })
  | undefined =>
  (
    window as unknown as {
      METABASE_EMBEDDING_SDK_BUNDLE?: Record<string, unknown>;
    }
  ).METABASE_EMBEDDING_SDK_BUNDLE;

// The real provider props (auth config + redux store), read from the endowed
// props store — the same shape the SDK facade feeds the mediated ComponentProvider,
// so the trusted component actually renders (and reaches the smuggled children)
// instead of crashing on a missing authConfig.
const getProviderProps = (): Record<string, unknown> => {
  const store = (
    window as unknown as {
      METABASE_PROVIDER_PROPS_STORE?: {
        getState?: () => {
          props?: Record<string, unknown>;
          internalProps?: { reduxStore?: unknown };
        };
      };
    }
  ).METABASE_PROVIDER_PROPS_STORE;
  const state = store?.getState?.();

  return {
    ...(state?.props ?? {}),
    reduxStore: state?.internalProps?.reduxStore,
  };
};

/**
 * A React element object hand-crafted *without* the sandbox's gated
 * `createElement`, using the realm-shared `react.element` symbol. If host React
 * ever rendered it, it would create a real (non-sandboxed) iframe; its ref hands
 * that iframe's window back so the caller can attempt the privileged call.
 */
const makeEscapeIframeElement = (onWindow: (w: Window | null) => void) => ({
  $$typeof: Symbol.for("react.element"),
  type: "iframe",
  key: null,
  ref: (element: HTMLIFrameElement | null) => {
    if (element) {
      onWindow(element.contentWindow);
    }
  },
  props: { style: { display: "none" } },
  _owner: null,
});

/**
 * When the app runs on guest React, rendering a blocked tag makes the guest
 * `createElement` throw inside the reconciler. This boundary catches that so the
 * outcome is reported as `blocked:` instead of tearing down the whole tree.
 */
class BlockBoundary extends Component<
  { onError: (msg: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(`blocked:${describeError(error)}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function App() {
  const env = getEnv();
  const [result, setResult] = useState("pending");
  const [reactMode, setReactMode] = useState<ReactMode | null>(null);
  const escapedRef = useRef(false);

  const escapeVia = (realm: Window | null | undefined) => {
    if (!realm) {
      setResult("blocked:no-contentWindow");
      return;
    }

    attemptPrivilegedCall(realm, env.target, env.payload)
      .then(setResult)
      .catch((err) => setResult(`blocked:${describeError(err)}`));
  };

  const runCreateElement = () => {
    try {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      escapeVia(iframe.contentWindow);
    } catch (err) {
      setResult(`blocked:${describeError(err)}`);
    }
  };

  // Mount an attacker-chosen component through the host mediated-mount bridge.
  // `<div>` is not a blocked tag, so the container itself is created normally.
  const mountViaBridge = (
    component: unknown,
    componentProps: Record<string, unknown>,
  ) => {
    const bridge = getMountBridge();
    const bundle = getSdkBundle();
    if (!bridge || !bundle) {
      throw new Error("no mount bridge / SDK bundle");
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    bridge(
      container,
      bundle.ComponentProvider,
      getProviderProps(),
      component,
      componentProps,
    );
  };

  // Vector 1: swap the whole endowed bundle for an evil one whose component
  // renders an escape iframe host-side.
  const runReplaceBundle = () => {
    const evilBundle = {
      ComponentProvider: (props: { children?: ReactNode }) =>
        props.children ?? null,
      StaticQuestion: () => makeEscapeIframeElement(escapeVia),
    };
    try {
      (
        window as unknown as { METABASE_EMBEDDING_SDK_BUNDLE?: unknown }
      ).METABASE_EMBEDDING_SDK_BUNDLE = evilBundle;

      if (getSdkBundle() !== (evilBundle as unknown)) {
        setResult("blocked:bundle-global-is-read-only");
        return;
      }
      mountViaBridge(evilBundle.StaticQuestion, {});
    } catch (err) {
      setResult(`blocked:${describeError(err)}`);
    }
  };

  // Vector 2: add an evil component to the bundle object, then mount it by name.
  const runMutateBundle = () => {
    try {
      const bundle = getSdkBundle();
      if (!bundle) {
        setResult("blocked:no-bundle");
        return;
      }
      const evilComponent = () => makeEscapeIframeElement(escapeVia);
      (bundle as Record<string, unknown>).EvilComponent = evilComponent;
      mountViaBridge((bundle as Record<string, unknown>).EvilComponent, {});
    } catch (err) {
      setResult(`blocked:${describeError(err)}`);
    }
  };

  // Vector 3: mount a real, trusted SDK component (passes the bridge's identity
  // check) but smuggle the escape iframe through props as a hand-crafted element.
  const runPropsSmuggle = () => {
    try {
      const bundle = getSdkBundle();

      if (!bundle) {
        setResult("blocked:no-bundle");
        return;
      }

      mountViaBridge(bundle.InteractiveQuestion, {
        children: makeEscapeIframeElement(escapeVia),
      });
    } catch (err) {
      setResult(`blocked:${describeError(err)}`);
    }
  };

  return (
    <div data-testid="data-app-escape" style={{ padding: 24 }}>
      <h1>Escape probe</h1>
      <div data-testid="escape-result">{result}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button data-testid="escape-create-element" onClick={runCreateElement}>
          document.createElement about:blank
        </button>
        <button
          data-testid="escape-react-about-blank"
          onClick={() => setReactMode("react-iframe-about-blank")}
        >
          React iframe about:blank
        </button>
        <button
          data-testid="escape-react-src"
          onClick={() => setReactMode("react-iframe-src")}
        >
          React iframe src
        </button>
        <button
          data-testid="escape-react-srcdoc"
          onClick={() => setReactMode("react-iframe-srcdoc")}
        >
          React iframe srcdoc
        </button>
        <button data-testid="escape-replace-bundle" onClick={runReplaceBundle}>
          Replace SDK bundle global
        </button>
        <button data-testid="escape-mutate-bundle" onClick={runMutateBundle}>
          Mutate SDK bundle object
        </button>
        <button data-testid="escape-props-smuggle" onClick={runPropsSmuggle}>
          Smuggle element via props
        </button>
      </div>

      <BlockBoundary onError={setResult}>
        {reactMode === "react-iframe-about-blank" && (
          <iframe
            title="escape-target"
            ref={(element) => {
              if (element && !escapedRef.current) {
                escapedRef.current = true;
                escapeVia(element.contentWindow);
              }
            }}
            style={{ display: "none" }}
          />
        )}
        {reactMode === "react-iframe-src" && (
          <iframe
            title="escape-target"
            src={`${env.instanceUrl}/`}
            onLoad={(e) => escapeVia(e.currentTarget.contentWindow)}
            style={{ display: "none" }}
          />
        )}
        {reactMode === "react-iframe-srcdoc" && (
          <iframe
            title="escape-target"
            srcDoc={'<!doctype html><meta charset="utf-8">'}
            onLoad={(e) => escapeVia(e.currentTarget.contentWindow)}
            style={{ display: "none" }}
          />
        )}
      </BlockBoundary>
    </div>
  );
}
