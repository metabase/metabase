import type { CustomVizPluginId } from "metabase-types/api";

// DOM scoping: every Element crossing the membrane is filtered. Elements
// inside the plugin's mount subtree (marked with data-plugin-sandbox=<id>)
// pass through real; elements outside are replaced with a detached decoy of
// the same nodeName so the plugin can't read or mutate host UI.

const PLUGIN_SANDBOX_ATTR = "data-plugin-sandbox";
export const ACTIVE_ELEMENT_GETTER = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "activeElement",
)?.get;

export function getSafeSandboxDomElement(
  el: Element,
  pluginId: CustomVizPluginId,
): Element {
  // `instanceof Element` can match values whose prototype chain includes
  // Element.prototype but which aren't real host Nodes (e.g. objects with a
  // re-set prototype, some membrane edge cases). Node-typed methods throw
  // brand checks on those — guard the whole walk and pass through on
  // failure: such values can't be host UI worth replacing with a decoy.
  try {
    // pass through elements that are not part of the main DOM tree
    if (!document.contains(el)) {
      return el;
    }

    const selector = `[${PLUGIN_SANDBOX_ATTR}="${pluginId}"]`;
    if (el.closest(selector) !== null) {
      return el;
    }

    return makeDecoyElement(pluginId, el);
  } catch {
    return el;
  }
}

// document.activeElement crosses the membrane and would otherwise be replaced
// with a decoy when focus is on host UI — noisy and confusing for libraries
// (notably React) that probe activeElement during rendering. Return null when
// the focused element is outside the plugin's subtree, so the plugin sees
// "nothing focused inside my React tree" rather than a fake element.
export function activeElementDistortion(pluginId: CustomVizPluginId) {
  return function activeElement(this: Document): Element | null {
    const el = ACTIVE_ELEMENT_GETTER!.call(this) as Element | null;
    if (!el) {
      return null;
    }
    const inSandbox = el.closest(`[${PLUGIN_SANDBOX_ATTR}="${pluginId}"]`);
    return inSandbox ? el : null;
  };
}

export function isDomElement(obj: unknown): obj is Element {
  if (typeof obj === "object" && obj instanceof Element) {
    try {
      return obj.nodeName !== undefined;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function describeElement(el: Element): string {
  const tag = el.nodeName.toLowerCase();
  if (el.id) {
    return `<${tag} id="${el.id}">`;
  }
  const testId = el.getAttribute("data-testid");
  if (testId) {
    return `<${tag} data-testid="${testId}">`;
  }
  return `<${tag}>`;
}

function makeDecoyElement(pluginId: CustomVizPluginId, el: Element): Element {
  console.error(
    `[plugin ${pluginId}] swapped out-of-scope ${describeElement(el)} with decoy`,
  );
  const decoy = document.createElement(el.nodeName.toLowerCase());
  decoy.setAttribute("data-plugin-sandbox-decoy", "true");
  decoy.setAttribute("id", "sandbox-decoy");
  return decoy;
}
