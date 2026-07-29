import createVirtualEnvironment from "@locker/near-membrane-dom";

import { getSubpathSafeUrl } from "metabase/urls";
import type { CustomVizPluginId } from "metabase-types/api";

import { makeDistortionCallback } from "./distortions";

export type SandboxMode = "hosted" | "blank";

// Needed for React style declarations to be applied correctly.
function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

// Same-origin endpoint that serves a tiny HTML document with a permissive,
// per-document CSP (allowing `'unsafe-eval'`).
const SANDBOX_HOST_URL = "/api/ee/custom-viz-plugin/sandbox-host";

let sandboxWebAssemblyPromise: Promise<typeof WebAssembly | null> | null = null;

function borrowSandboxWebAssembly(): Promise<typeof WebAssembly | null> {
  sandboxWebAssemblyPromise ??= (async () => {
    try {
      const iframe = document.createElement("iframe");
      iframe.src = getSubpathSafeUrl(SANDBOX_HOST_URL);
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");
      const loaded = new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () =>
          reject(new Error("sandbox-host iframe failed to load"));
      });
      document.body.appendChild(iframe);
      await loaded;
      // `Window`'s lib type doesn't declare `WebAssembly`, but every realm
      // has one; the cast just surfaces it.
      const contentWindow = iframe.contentWindow as
        | (Window & typeof globalThis)
        | null;
      return contentWindow?.WebAssembly ?? null;
    } catch {
      return null;
    }
  })();
  return sandboxWebAssemblyPromise;
}

export async function createPluginSandbox(
  pluginId: CustomVizPluginId,
  mode: SandboxMode = "hosted",
) {
  let capturedFactory: unknown;

  // "blank" skips the sandbox-host endpoint and lets the library fall back to
  // about:blank. Used in Storybook where no backend serves the endpoint.
  const iframeSrc =
    mode === "hosted" ? getSubpathSafeUrl(SANDBOX_HOST_URL) : undefined;

  const sandboxWebAssembly =
    mode === "hosted" ? await borrowSandboxWebAssembly() : null;

  const env = await createVirtualEnvironment(window, {
    ...(iframeSrc ? { iframeSrc } : {}),
    distortionCallback: makeDistortionCallback(pluginId),
    liveTargetCallback: isLiveTarget,
    endowments: Object.getOwnPropertyDescriptors({
      get __customVizPlugin__() {
        return capturedFactory;
      },
      set __customVizPlugin__(value: unknown) {
        capturedFactory = value;
      },
      __METABASE_VIZ_API__: window.__METABASE_VIZ_API__,
      ...(sandboxWebAssembly ? { WebAssembly: sandboxWebAssembly } : {}),
    }),
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
