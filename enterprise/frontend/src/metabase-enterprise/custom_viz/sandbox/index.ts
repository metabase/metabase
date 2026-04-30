import createVirtualEnvironment from "@locker/near-membrane-dom";

import { makeDistortionCallback } from "./distortions";

// Tell near-membrane to expose these objects as "live targets" — assignments
// and reads use the real object's [[Set]]/[[Get]] internal methods directly,
// honoring engine-internal WebIDL named-property handlers.
//
// CSSStyleDeclaration is the motivating case: its individual CSS properties
// (`style.display`, `style.color`, …) aren't accessor descriptors; they're
// implemented via WebIDL named-property handlers. The default near-membrane
// proxy machinery routes `style.X = value` through Reflect.set, which
// bypasses those handlers — the assignment becomes a no-op and the inline
// CSS is never applied. Marking style as live makes the assignment go
// through the engine's real [[Set]] for CSSStyleDeclaration, which fires
// the named handler and the style sticks.
function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createPluginSandbox(pluginId: string) {
  let capturedFactory: unknown;

  const env = createVirtualEnvironment(window, {
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
