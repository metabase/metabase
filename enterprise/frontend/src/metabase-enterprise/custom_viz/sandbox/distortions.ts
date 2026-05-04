import { BLOCKED_NATIVE_REFS } from "./distortions-blocked-apis";
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
import {
  ACTIVE_ELEMENT_GETTER,
  activeElementDistortion,
  getSafeSandboxDomElement,
  isDomElement,
} from "./distortions-dom-read";

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

    const blockedLabel = BLOCKED_NATIVE_REFS.get(value);
    if (blockedLabel) {
      return function blocked() {
        throw new Error(
          `[plugin ${pluginId}] blocked API call: ${blockedLabel}`,
        );
      };
    }

    return value;
  };
}
