import type { DataAppCommentSource } from "../types/comments";

/** How far up the fiber tree a source location is looked for. */
const MAX_FIBER_WALK = 80;

const MAX_COMPONENT_PATH = 6;

const FIBER_KEY_PREFIX = "__reactFiber$";

export interface ReactTargetDescription {
  source: DataAppCommentSource | null;
  /** The components that rendered the node, outermost first. */
  componentPath: string[];
}

/**
 * Everything in a fiber comes from the app's own bundle, which runs inside the
 * Near Membrane sandbox: each property is an untyped — and possibly proxied —
 * lookup that may throw. `Reflect.get` keeps every one of them a guarded read
 * of an `unknown`, with no cast into a shape React does not promise.
 */
const readProperty = (value: object, key: string): unknown => {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
};

const asObject = (value: unknown): object | null =>
  typeof value === "object" && value !== null ? value : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** React keeps the fiber on the DOM node under a build-specific key. */
const readFiber = (node: Element): object | null => {
  const key = Object.keys(node).find((candidate) =>
    candidate.startsWith(FIBER_KEY_PREFIX),
  );

  return key ? asObject(readProperty(node, key)) : null;
};

const readName = (holder: object): string | null =>
  asNonEmptyString(readProperty(holder, "displayName")) ??
  asNonEmptyString(readProperty(holder, "name"));

const readComponentName = (fiber: object): string | null => {
  const type = readProperty(fiber, "type");

  // A host element's `type` is its tag name, which the selector already says.
  if (typeof type !== "function" && typeof type !== "object") {
    return null;
  }

  if (type === null) {
    return null;
  }

  // `memo` and `forwardRef` wrappers carry the name on what they wrap.
  const wrapped =
    asObject(readProperty(type, "render")) ??
    asObject(readProperty(type, "type"));

  return readName(type) ?? (wrapped ? readName(wrapped) : null);
};

const readSource = (
  fiber: object,
  appRoot: string | null,
): DataAppCommentSource | null => {
  const debugSource = asObject(readProperty(fiber, "_debugSource"));

  if (!debugSource) {
    return null;
  }

  const fileName = asNonEmptyString(readProperty(debugSource, "fileName"));
  const lineNumber = readProperty(debugSource, "lineNumber");

  if (!fileName || typeof lineNumber !== "number") {
    return null;
  }

  // A location inside a dependency tells the author nothing they can edit; the
  // walk continues to the app's own JSX that rendered it.
  if (fileName.includes("/node_modules/")) {
    return null;
  }

  const columnNumber = readProperty(debugSource, "columnNumber");

  return {
    file: toAppRelativePath(fileName, appRoot),
    line: lineNumber,
    column: typeof columnNumber === "number" ? columnNumber : null,
  };
};

const toAppRelativePath = (file: string, appRoot: string | null): string =>
  appRoot && file.startsWith(`${appRoot}/`)
    ? file.slice(appRoot.length + 1)
    : file;

/**
 * Where in the app's source the DOM node was written, and which components
 * rendered it.
 *
 * The source location comes from React's `_debugSource`, which the dev server's
 * JSX transform stamps on every element the app's own code creates. It is
 * missing when the preview runs a bundle built without that transform, or when
 * the node comes from a prebuilt SDK component — then the nearest enclosing
 * element from the app's own source is reported instead, and `componentPath`
 * still names what rendered it.
 */
export const describeReactTarget = (
  node: Element,
  appRoot: string | null,
): ReactTargetDescription => {
  const componentPath: string[] = [];
  let source: DataAppCommentSource | null = null;
  let fiber = readFiber(node);

  for (let step = 0; fiber && step < MAX_FIBER_WALK; step++) {
    source ??= readSource(fiber, appRoot);

    const name = readComponentName(fiber);

    if (name && componentPath.at(0) !== name) {
      componentPath.unshift(name);
    }

    fiber = asObject(readProperty(fiber, "return"));
  }

  return { source, componentPath: componentPath.slice(-MAX_COMPONENT_PATH) };
};
