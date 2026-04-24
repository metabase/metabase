import createVirtualEnvironment from "@locker/near-membrane-dom";

export function createPluginSandbox(pluginId: string) {
  let capturedFactory: unknown;

  const distortionMap = new Map<object, () => unknown>([
    [
      document.createElement,
      () => (tag: string) =>
        ["script", "iframe", "object"].includes(tag)
          ? document.createDocumentFragment()
          : document.createElement(tag),
    ],
    [
      document.write,
      () => () => {
        console.warn(`[plugin ${pluginId}] document.write is not allowed`);
      },
    ],
    [
      window.alert,
      () => (msg: unknown) => console.warn(`[plugin ${pluginId}] alert:`, msg),
    ],
    [window.confirm, () => () => false],
    [window.prompt, () => () => null],
  ]);

  const env = createVirtualEnvironment(window, {
    distortionCallback(v: object) {
      return (distortionMap.get(v)?.() ?? v) as object;
    },
    endowments: Object.getOwnPropertyDescriptors({
      // Intercept factory assignment — keeps plugin bundle format unchanged
      get __customVizPlugin__() {
        return capturedFactory;
      },
      set __customVizPlugin__(value: unknown) {
        capturedFactory = value;
      },
      // Pass API explicitly so React identity is preserved in the host realm
      // (avoids instanceof / hook issues that arise when React is proxied)
      __METABASE_VIZ_API__: window.__METABASE_VIZ_API__,
    }),
  });

  return {
    evaluate(code: string): unknown {
      env.evaluate(code);
      return capturedFactory;
    },
  };
}
