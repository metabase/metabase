import type { CustomVizPluginId } from "metabase-types/api";

// DOM scoping is custom-viz-specific: each custom-viz plugin renders inside
// its own `<div data-plugin-sandbox="<id>">…</div>` container, and every Node
// crossing the membrane is filtered against that selector. Nodes inside the
// plugin's container pass through real; nodes outside (sibling cards, the
// dashboard's chrome, anywhere in the host DOM) are replaced with detached
// decoys of the same kind so the plugin can't read or mutate host UI.
//
// Why this filters on Node, not just Element:
//
// `Document` is itself a Node — not an Element — and is also the obvious
// root for `createTreeWalker(document, …)`, `createNodeIterator(document, …)`,
// `MutationObserver.observe(document, …)`, and `Range.setStart(document, 0)`.
// An Element-only filter would leave those APIs walking the entire host
// DOM and surfacing real host Text/Comment nodes.

const PLUGIN_SANDBOX_ATTR = "data-plugin-sandbox";

export const ACTIVE_ELEMENT_GETTER = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "activeElement",
)?.get;

export function getSafeSandboxDomNode(
  node: Node,
  pluginId: CustomVizPluginId,
): Node {
  try {
    if (!document.contains(node)) {
      return node;
    }

    const selector = `[${PLUGIN_SANDBOX_ATTR}="${pluginId}"]`;
    const ownerElement = getOwnerElement(node);

    if (ownerElement?.closest(selector) !== null) {
      return node;
    }

    return makeDecoyNode(pluginId, node);
  } catch {
    return node;
  }
}

function getOwnerElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    // Unjustified type cast. FIXME
    return node as Element;
  }

  // text, comment, document fragment
  if ("parentElement" in node) {
    return node.parentElement;
  }

  return null;
}

// `document.activeElement` crosses the membrane and would otherwise be
// replaced with a decoy when focus is on host UI — noisy and confusing for
// libraries (notably React) that probe activeElement during rendering.
// Return null when the focused element is outside the plugin's subtree, so
// the plugin sees "nothing focused inside my React tree" rather than a fake
// element.
export function activeElementDistortion(pluginId: CustomVizPluginId) {
  return function activeElement(this: Document): Element | null {
    // Unjustified type cast. FIXME
    const el = ACTIVE_ELEMENT_GETTER!.call(this) as Element | null;
    if (!el) {
      return null;
    }
    const inSandbox = el.closest(`[${PLUGIN_SANDBOX_ATTR}="${pluginId}"]`);
    return inSandbox ? el : null;
  };
}

export function isDomNode(obj: unknown): obj is Node {
  if (typeof obj === "object" && obj instanceof Node) {
    try {
      return obj.nodeName !== undefined;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function describeNode(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
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
  return `<${node.nodeName.toLowerCase()}>`;
}

function createDecoyForNode(node: Node): Node {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const decoy = document.createElement(node.nodeName.toLowerCase());
      decoy.setAttribute("data-plugin-sandbox-decoy", "true");
      decoy.setAttribute("id", "sandbox-decoy");
      return decoy;
    }
    case Node.TEXT_NODE:
    case Node.CDATA_SECTION_NODE:
      return document.createTextNode("");
    case Node.COMMENT_NODE:
      return document.createComment("");
    case Node.DOCUMENT_FRAGMENT_NODE:
      return document.createDocumentFragment();
    default:
      return node;
  }
}

function makeDecoyNode(pluginId: CustomVizPluginId, node: Node): Node {
  const decoy = createDecoyForNode(node);
  if (decoy === node) {
    return node;
  }

  return decoy;
}
