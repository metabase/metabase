import { getFunctionName } from "./debugging";
import { BLOCKED_NATIVE_NAMES } from "./distortions-blocked-apis";
import {
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
  INSERT_ADJACENT_HTML,
  SANITIZED_SETTERS,
  SET_ATTRIBUTE,
  SET_ATTRIBUTE_NS,
  createElementDistortion,
  createElementNSDistortion,
  insertAdjacentHTMLDistortion,
  sanitizedSetterDistortion,
  setAttributeDistortion,
  setAttributeNSDistortion,
} from "./distortions-dom-mutate";
import { getSafeSandboxDomElement, isDomElement } from "./distortions-dom-read";

const ACTIVE_ELEMENT_GETTER = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "activeElement",
)?.get;

export function makeDistortionCallback(pluginId: string) {
  return function distortionCallback(value: object): object {
    if (isDomElement(value)) {
      return getSafeSandboxDomElement(value, pluginId);
    }

    if (typeof value !== "function") {
      return value;
    }

    if (SANITIZED_SETTERS.has(value)) {
      const info = SANITIZED_SETTERS.get(value);
      if (info) {
        return sanitizedSetterDistortion(pluginId, info.name, info.originalSet);
      }
    }

    if (value === ACTIVE_ELEMENT_GETTER) {
      return activeElementDistortion(pluginId);
    }

    if (value === CREATE_ELEMENT) {
      return createElementDistortion(pluginId);
    }

    if (value === CREATE_ELEMENT_NS) {
      return createElementNSDistortion(pluginId);
    }

    if (value === INSERT_ADJACENT_HTML) {
      return insertAdjacentHTMLDistortion(pluginId);
    }

    if (value === SET_ATTRIBUTE) {
      return setAttributeDistortion(pluginId);
    }

    if (value === SET_ATTRIBUTE_NS) {
      return setAttributeNSDistortion(pluginId);
    }

    // Default-allow native functions, with a name-based blocklist for the
    // few APIs that must never be reachable from the sandbox. Identity-based
    // allowlisting is unreliable: near-membrane wraps host functions when
    // crossing into the sandbox iframe, so the runtime reference often
    // differs from what we capture in host realm. Name matching is
    // realm-agnostic. The targeted distortions above (innerHTML, setAttribute,
    // createElement, etc.) still work because near-membrane preserves
    // identity for those well-known intrinsics — the hot path stays gated.
    const name = getFunctionName(value);
    if (BLOCKED_NATIVE_NAMES.has(name)) {
      return function blocked() {
        throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
      };
    }

    return value;
  };
}

// document.activeElement crosses the membrane and would otherwise be replaced
// with a decoy when focus is on host UI — noisy and confusing for libraries
// (notably React) that probe activeElement during rendering. Return null when
// the focused element is outside the plugin's subtree, so the plugin sees
// "nothing focused inside my React tree" rather than a fake element.
function activeElementDistortion(pluginId: string) {
  return function activeElement(this: Document): Element | null {
    const el = ACTIVE_ELEMENT_GETTER!.call(this) as Element | null;
    if (!el) {
      return null;
    }
    const inSandbox = el.closest(`[data-plugin-sandbox="${pluginId}"]`);
    return inSandbox ? el : null;
  };
}
