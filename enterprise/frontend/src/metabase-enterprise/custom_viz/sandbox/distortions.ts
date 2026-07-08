import type { CustomVizPluginId } from "metabase-types/api";

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
  ACTIVE_ELEMENT_GETTER,
  activeElementDistortion,
  getSafeSandboxDomNode,
  isDomNode,
} from "./distortions-dom-read";
import {
  ADD_EVENT_LISTENER,
  addEventListenerDistortion,
} from "./distortions-event";

export function makeDistortionCallback(pluginId: CustomVizPluginId) {
  return function distortionCallback(value: object): object {
    if (isDomNode(value)) {
      return getSafeSandboxDomNode(value, pluginId);
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

    if (value === ADD_EVENT_LISTENER) {
      return addEventListenerDistortion(pluginId);
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

    if (value === SET_ATTRIBUTE_NODE) {
      return setAttributeNodeDistortion(pluginId);
    }

    if (value === SET_ATTRIBUTE_NODE_NS) {
      return setAttributeNodeNSDistortion(pluginId);
    }

    if (value === SET_NAMED_ITEM) {
      return setNamedItemDistortion(pluginId);
    }

    if (value === SET_NAMED_ITEM_NS) {
      return setNamedItemNSDistortion(pluginId);
    }

    if (value === SET_ATTR_VALUE_DESCRIPTOR) {
      return attrValueSetterDistortion(pluginId);
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
