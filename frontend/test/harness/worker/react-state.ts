// React keeps its work phase in module state, and an error that escapes its
// commit phase leaves that state set. React stays loaded between spec files, so
// every later render in the worker then fails.
import { createRequire } from "node:module";
import path from "node:path";

import { root } from "../jest-config.ts";

type ReactDom = { flushSync: (callback: () => void) => void };

const require = createRequire(import.meta.url);
const requireFromRoot = createRequire(path.join(root, "package.json"));
const FLUSH_DURING_WORK = "flushSync was called from inside a lifecycle method";

/**
 * Whether React still believes that it is rendering or committing. Nothing
 * of React runs when the runner asks, so that state can only be left over.
 */
export function isReactStuck(): boolean {
  const reactDom: ReactDom | undefined =
    require.cache[requireFromRoot.resolve("react-dom")]?.exports;
  if (!reactDom) {
    return false;
  }
  const consoleError = console.error;
  let isStuck = false;
  console.error = (message: unknown) => {
    isStuck ||= String(message).includes(FLUSH_DURING_WORK);
  };
  try {
    reactDom.flushSync(() => {});
  } catch {
    // Work that was pending can throw here. Only the warning matters.
  } finally {
    console.error = consoleError;
  }
  return isStuck;
}
