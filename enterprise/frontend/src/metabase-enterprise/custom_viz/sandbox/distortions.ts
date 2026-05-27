import { makeSandboxDistortionCallback } from "metabase-enterprise/plugin-sandbox-utils";
import type { CustomVizPluginId } from "metabase-types/api";

import {
  ACTIVE_ELEMENT_GETTER,
  activeElementDistortion,
  getSafeSandboxDomNode,
  isDomNode,
} from "./distortions-dom-read";

/**
 * Custom-viz Near Membrane distortion callback.
 *
 * Composes:
 *   1. Custom-viz-only DOM scoping (`getSafeSandboxDomNode`,
 *      `activeElementDistortion`) keyed on `data-plugin-sandbox=<pluginId>`.
 *   2. The shared sandbox callback from `plugin-sandbox-utils`, which blocks
 *      network egress, sanitizes DOM mutations, and blocks dangerous element
 *      creates and event listeners.
 */
export function makeDistortionCallback(pluginId: CustomVizPluginId) {
  const sharedDistortion = makeSandboxDistortionCallback(`plugin ${pluginId}`);

  return function distortionCallback(value: object): object {
    if (isDomNode(value)) {
      return getSafeSandboxDomNode(value, pluginId);
    }

    if (value === ACTIVE_ELEMENT_GETTER) {
      return activeElementDistortion(pluginId);
    }

    return sharedDistortion(value);
  };
}
