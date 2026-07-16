import type { BrowserEnvironmentOptions } from "@locker/near-membrane-dom";
import createVirtualEnvironment from "@locker/near-membrane-dom";

import { api } from "metabase/api/client";
import { getCapturedEmbedderOrigin } from "metabase/embedding-sdk/embedder-origin";
import { getSubpathSafeUrl } from "metabase/urls";
import type { CustomVizPluginId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { makeDistortionCallback } from "./distortions";

export type SandboxMode = "hosted" | "blank" | "hosted-signed";

// Needed for React style declarations to be applied correctly.
function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

// Same-origin endpoint that serves a tiny HTML document with a permissive,
// per-document CSP (allowing `'unsafe-eval'`).
const SANDBOX_HOST_URL = "/api/ee/custom-viz-plugin/sandbox-host";

// EAJS variant: session-cookie auth doesn't reach an iframe `src`, so the
// donor is fetched behind a short-lived signed token instead (mint via POST,
// then load the returned URL as the sandbox iframe).
const SANDBOX_HOST_EAJS_SIGN_URL =
  "/api/ee/custom-viz-plugin/sandbox-host-eajs/sign";
const SANDBOX_HOST_EAJS_PATH = "/api/ee/custom-viz-plugin/sandbox-host-eajs";
const MAX_HOSTED_SIGNED_ATTEMPTS = 2;
// Side-effect free; only here to exercise the sandbox's native eval.
const SANDBOX_PROBE_EXPRESSION = "1";

type PluginSandboxEnv = Awaited<ReturnType<typeof createVirtualEnvironment>>;
// The probe/verification steps only need `.evaluate`, not the full (mostly
// private) VirtualEnvironment surface. Narrower than PluginSandboxEnv so
// tests can pass a plain `{ evaluate }` fake instead of a real instance.
type EvaluableEnv = Pick<PluginSandboxEnv, "evaluate">;

/**
 * The customer page's origin, as seen from inside the EAJS iframe. There's
 * no first-party session here, so this is what the sign endpoint validates
 * against its embedding-origin allowlist.
 *
 * Prefers the origin captured from the parent's setSettings message
 * (browser-attested, immune to the host page's Referrer-Policy) and falls
 * back to `document.referrer`.
 */
export function getEmbedderOrigin(): string {
  const captured = getCapturedEmbedderOrigin();
  if (captured) {
    return captured;
  }
  if (document.referrer) {
    return new URL(document.referrer).origin;
  }
  throw new Error("Cannot determine the embedding page's origin");
}

/**
 * Mint a fresh signed sandbox donor URL for the current embedder origin.
 */
export async function mintSandboxHostEajsUrl(): Promise<string> {
  const origin = getEmbedderOrigin();
  const res = await api.fetch({
    method: "POST",
    url: SANDBOX_HOST_EAJS_SIGN_URL,
    body: { origin },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to mint the EAJS sandbox donor URL: HTTP ${res.status}`,
    );
  }
  const data: unknown = await res.json();
  const url = isObject(data) && typeof data.url === "string" ? data.url : null;
  if (!url) {
    throw new Error(
      "The sandbox sign endpoint returned an unexpected response",
    );
  }
  return getSubpathSafeUrl(url);
}

/**
 * Find the iframe near-membrane just appended for `iframeSrc`. Tokens are
 * unique per mint, so the `src` attribute uniquely identifies it; searching
 * from the end picks the most recently appended match if duplicates exist.
 */
export function findSandboxIframeBySrc(
  src: string,
): HTMLIFrameElement | undefined {
  const iframes = document.querySelectorAll("iframe");
  for (let i = iframes.length - 1; i >= 0; i--) {
    if (iframes[i].getAttribute("src") === src) {
      return iframes[i];
    }
  }
  return undefined;
}

/**
 * The iframe `load` event fires for error pages too, so a successful load
 * doesn't mean we got the real donor document. DOM inspection of the
 * loaded document isn't reliable either (near-membrane's setup can replace
 * document nodes with sandboxed decoys as a side effect of linking the
 * realm). Probe through the membrane instead: the real donor's per-document
 * CSP allows `'unsafe-eval'`, so a trivial `env.evaluate` succeeds. Any
 * other document (notably the donor's uniform 404 for an invalid/expired
 * token) carries the global strict CSP, so the underlying native `eval`
 * throws and `env.evaluate` propagates that.
 *
 * Strictly this proves "eval is allowed here", not donor identity - but in
 * production every other same-origin document blocks eval, and that
 * capability (plus an empty document) is all the sandbox needs anyway.
 */
export function probeSandboxEval(env: EvaluableEnv): boolean {
  try {
    env.evaluate(SANDBOX_PROBE_EXPRESSION);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plugin code can read its own iframe's `location` by design, and
 * near-membrane error messages can embed the URL. Scrub the one-time token
 * out of it before any plugin code runs.
 */
export function scrubSandboxHostToken(iframe: HTMLIFrameElement): void {
  try {
    iframe.contentWindow?.history.replaceState(
      null,
      "",
      SANDBOX_HOST_EAJS_PATH,
    );
  } catch {
    // best-effort scrub; nothing else to do if this throws
  }
}

/**
 * Verify an already-created env/iframe pair: probe through the membrane,
 * clean up the iframe on a failed probe, scrub the token on success, and
 * fail closed when a verified donor's iframe can't be located (we'd have
 * no way to scrub its token). Returns the env on success, or `null` on a
 * retry-able probe failure.
 */
export function finalizeHostedSignedAttempt<T extends EvaluableEnv>(
  env: T,
  iframe: HTMLIFrameElement | undefined,
): T | null {
  if (!probeSandboxEval(env)) {
    // Not the real donor. Drop the orphaned iframe instead of leaving it in
    // the DOM for a retry to pile another one on top of.
    iframe?.remove();
    return null;
  }

  if (!iframe) {
    throw new Error(
      "Could not locate the EAJS sandbox donor iframe to scrub its token",
    );
  }

  scrubSandboxHostToken(iframe);
  return env;
}

/**
 * One mint-and-create attempt. Returns the verified env on success, or
 * `null` when the probe fails (a retry-able outcome: a fresh mint gets a
 * fresh token). An error thrown here (mint failure, or a verified donor
 * whose iframe we still can't locate to scrub) is not retry-able and
 * propagates to the caller uncaught.
 */
async function attemptHostedSignedEnv(
  envOptions: Omit<BrowserEnvironmentOptions, "iframeSrc">,
): Promise<PluginSandboxEnv | null> {
  const iframeSrc = await mintSandboxHostEajsUrl();
  const envPromise = createVirtualEnvironment(window, {
    ...envOptions,
    iframeSrc,
  });
  // Grab the iframe reference synchronously, right after near-membrane
  // appends it and before awaiting; see findSandboxIframeBySrc.
  const iframe = findSandboxIframeBySrc(iframeSrc);
  const env = await envPromise;
  return finalizeHostedSignedAttempt(env, iframe);
}

/**
 * Run `attemptFn` and retry once on a `null` (probe-failed) result. An
 * exception thrown by `attemptFn` itself propagates immediately, uncaught.
 */
export async function verifySandboxIframeWithRetry(
  attemptFn: () => Promise<PluginSandboxEnv | null>,
  maxAttempts = MAX_HOSTED_SIGNED_ATTEMPTS,
): Promise<PluginSandboxEnv> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const env = await attemptFn();
    if (env) {
      return env;
    }
    if (attempt === maxAttempts) {
      throw new Error(
        "Failed to verify the EAJS custom-viz sandbox donor document",
      );
    }
  }
  // unreachable: the loop always returns or throws
  throw new Error(
    "Failed to verify the EAJS custom-viz sandbox donor document",
  );
}

async function createHostedSignedEnv(
  envOptions: Omit<BrowserEnvironmentOptions, "iframeSrc">,
) {
  return verifySandboxIframeWithRetry(() => attemptHostedSignedEnv(envOptions));
}

export async function createPluginSandbox(
  pluginId: CustomVizPluginId,
  mode: SandboxMode = "hosted",
) {
  let capturedFactory: unknown;

  const endowments = Object.getOwnPropertyDescriptors({
    get __customVizPlugin__() {
      return capturedFactory;
    },
    set __customVizPlugin__(value: unknown) {
      capturedFactory = value;
    },
    __METABASE_VIZ_API__: window.__METABASE_VIZ_API__,
  });

  const env =
    mode === "hosted-signed"
      ? await createHostedSignedEnv({
          distortionCallback: makeDistortionCallback(pluginId),
          liveTargetCallback: isLiveTarget,
          endowments,
        })
      : await createVirtualEnvironment(window, {
          // "blank" skips the sandbox-host endpoint and lets the library
          // fall back to about:blank. Used in Storybook where no backend
          // serves the endpoint.
          ...(mode === "hosted"
            ? { iframeSrc: getSubpathSafeUrl(SANDBOX_HOST_URL) }
            : {}),
          distortionCallback: makeDistortionCallback(pluginId),
          liveTargetCallback: isLiveTarget,
          endowments,
        });

  return {
    evaluate(code: string): unknown {
      try {
        env.evaluate(code);
      } catch (e) {
        // unwrap membrane-proxied Error
        let message: string;
        try {
          // Unjustified type cast. FIXME
          message = String((e as { message?: unknown })?.message ?? e);
        } catch {
          message = "Unknown error inside plugin sandbox";
        }
        throw new Error(message);
      }
      return capturedFactory;
    },
  };
}
