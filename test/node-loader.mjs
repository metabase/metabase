import { extname } from "path";

const mock = new URL("mocks/css.mjs", import.meta.url).href;

/**
 *
 * This hook intercepts module resolution, allowing us to handle
 * CSS/SVG files in a custom way. Instead of actually loading the CSS,
 * we short-circuit the resolution and return a mock module.
 *
 * @type {import('node:module').ResolveHook}
 */
export async function resolve(specifier, ctx, nextResolve) {
  const ext = extname(specifier);
  if (ext === ".css" || ext.startsWith(".svg")) {
    // For CSS/SCSS, return the mock CSS module and skip default resolution.
    return {
      format: "module",
      url: mock,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier);
}
