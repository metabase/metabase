import { BLOCKED_NATIVE_REFS } from "./distortions-blocked-apis";
import {
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
  INSERT_ADJACENT_HTML,
  SANITIZED_SETTERS,
  SET_ATTRIBUTE,
  SET_ATTRIBUTE_NODE,
  SET_ATTRIBUTE_NODE_NS,
  SET_ATTRIBUTE_NS,
  SET_ATTR_VALUE_DESCRIPTOR,
  SET_NAMED_ITEM,
  SET_NAMED_ITEM_NS,
  attrValueSetterDistortion,
  createElementDistortion,
  createElementNSDistortion,
  insertAdjacentHTMLDistortion,
  sanitizedSetterDistortion,
  setAttributeDistortion,
  setAttributeNSDistortion,
  setAttributeNodeDistortion,
  setAttributeNodeNSDistortion,
  setNamedItemDistortion,
  setNamedItemNSDistortion,
} from "./distortions-dom-mutate";
import {
  ADD_EVENT_LISTENER,
  addEventListenerDistortion,
} from "./distortions-event";

/**
 * Build the common subset of a Near Membrane `distortionCallback` shared by
 * every Metabase sandbox.
 *
 * This callback enforces:
 *   - blocked network-egress APIs (fetch, XHR, WebSocket, …) — see
 *     `distortions-blocked-apis`;
 *   - sanitized innerHTML / outerHTML / insertAdjacentHTML mutations via
 *     DOMPurify;
 *   - blocked element creation for dangerous tags (script, iframe, link,
 *     form, …);
 *   - blocked inline-event-handler attributes (`onclick="…"`) and
 *     `javascript:` URLs at the setAttribute boundary;
 *   - blocked `addEventListener` on `document`/`window` for typing /
 *     clipboard / storage event types.
 *
 * It does NOT handle DOM-node scoping (decoy nodes outside a script's
 * subtree, scope-aware `document.activeElement`). Scoping is consumer-
 * specific — custom-viz needs it for per-card isolation; data-app does not
 * — so each module composes that on top of this callback if it wants it.
 *
 * `errorPrefix` is the bracketed label that appears in thrown messages,
 * e.g. `data-app 5` produces `[data-app 5] blocked createElement: script`.
 */
export function makeSandboxDistortionCallback(
  errorPrefix: string,
  onBlocked?: (message: string) => void,
) {
  // Every distortion throws `[errorPrefix] blocked …` when the sandboxed script
  // hits a blocked operation. That throw frequently reaches the developer only
  // as an opaque cross-realm `#<Object>` (e.g. an unhandled async rejection), so
  // when a consumer provides `onBlocked` we wrap the distorted function to log
  // the real message synchronously at the block point — before re-throwing —
  // where the stack still points at the offending sandbox code.
  const reportThrows = (distorted: object): object => {
    if (!onBlocked || typeof distorted !== "function") {
      return distorted;
    }

    const fn = distorted;

    return function reportingDistortion(this: unknown, ...args: unknown[]) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        if (error instanceof Error) {
          onBlocked(error.message);
        }
        throw error;
      }
    };
  };

  const resolveDistortion = (value: object): object => {
    if (SANITIZED_SETTERS.has(value)) {
      const info = SANITIZED_SETTERS.get(value);
      if (info) {
        return sanitizedSetterDistortion(
          errorPrefix,
          info.name,
          info.originalSet,
        );
      }
    }

    if (value === ADD_EVENT_LISTENER) {
      return addEventListenerDistortion(errorPrefix);
    }

    if (value === CREATE_ELEMENT) {
      return createElementDistortion(errorPrefix);
    }

    if (value === CREATE_ELEMENT_NS) {
      return createElementNSDistortion(errorPrefix);
    }

    if (value === INSERT_ADJACENT_HTML) {
      return insertAdjacentHTMLDistortion(errorPrefix);
    }

    if (value === SET_ATTRIBUTE) {
      return setAttributeDistortion(errorPrefix);
    }

    if (value === SET_ATTRIBUTE_NS) {
      return setAttributeNSDistortion(errorPrefix);
    }

    if (value === SET_ATTRIBUTE_NODE) {
      return setAttributeNodeDistortion(errorPrefix);
    }

    if (value === SET_ATTRIBUTE_NODE_NS) {
      return setAttributeNodeNSDistortion(errorPrefix);
    }

    if (value === SET_NAMED_ITEM) {
      return setNamedItemDistortion(errorPrefix);
    }

    if (value === SET_NAMED_ITEM_NS) {
      return setNamedItemNSDistortion(errorPrefix);
    }

    if (value === SET_ATTR_VALUE_DESCRIPTOR) {
      return attrValueSetterDistortion(errorPrefix);
    }

    const blockedLabel = BLOCKED_NATIVE_REFS.get(value);
    if (blockedLabel) {
      return function blocked() {
        throw new Error(`[${errorPrefix}] blocked API call: ${blockedLabel}`);
      };
    }

    return value;
  };

  return function distortionCallback(value: object): object {
    if (typeof value !== "function") {
      return value;
    }

    const distorted = resolveDistortion(value);

    // Only wrap when we actually distorted `value`; pass-through values are
    // returned untouched so we never log on a non-blocked call.
    return distorted === value ? value : reportThrows(distorted);
  };
}
