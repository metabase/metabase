import { makeSandboxDistortionCallback } from "metabase-enterprise/plugin-sandbox-utils";
import type { DataAppId } from "metabase-types/api";

/**
 * Data-app Near Membrane distortion callback.
 *
 * Reuses the shared callback from `plugin-sandbox-utils` — same blocking of
 * fetch/XHR/etc., same DOM-mutation sanitization, same dangerous-tag /
 * inline-handler / `javascript:`-URL filters as custom-viz.
 *
 * Data-app intentionally omits the per-plugin DOM scoping (decoy nodes
 * outside a `data-plugin-sandbox` subtree) that custom-viz uses: a data app
 * is a full-page route owned by a single admin-uploaded bundle, so there's
 * no sibling DOM to protect from. If we ever want defense-in-depth there,
 * add scoping in this file — the shared module is unchanged.
 */
export function makeDistortionCallback(appId: DataAppId) {
  return makeSandboxDistortionCallback(`data-app ${appId}`);
}
