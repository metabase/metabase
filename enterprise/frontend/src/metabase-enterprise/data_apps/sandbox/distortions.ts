import { makeSandboxDistortionCallback } from "metabase/utils/scripts-sandbox";

import {
  type SandboxBlockedNetworkInfo,
  type SandboxRealm,
  makeSandboxFetch,
  makeSandboxXhr,
} from "./allowed-hosts";
import { makeCreateElementDistortion } from "./create-element";

export type SandboxBlockedEvent =
  | { type: "api"; message: string }
  | ({ type: "network" } & SandboxBlockedNetworkInfo);

export type SandboxBlockedListener = (event: SandboxBlockedEvent) => void;

/**
 * Data-app Near Membrane distortion callback.
 *
 * Reuses the shared callback from `utils/scripts-sandbox` — same blocking of
 * fetch/XHR/etc., same DOM-mutation sanitization, same dangerous-tag /
 * inline-handler / `javascript:`-URL filters as custom-viz — but, unlike
 * custom-viz, replaces the hard `fetch`/`XMLHttpRequest` block with an
 * allowlist when the app declares `allowed_hosts`. With no `allowed_hosts`
 * the wrappers are null and we fall through to the shared hard block, so the
 * default posture stays "no network".
 *
 * Data-app intentionally omits the per-plugin DOM scoping (decoy nodes
 * outside a `data-plugin-sandbox` subtree) that custom-viz uses: a data app
 * is a full-page route owned by a single admin-uploaded bundle, so there's
 * no sibling DOM to protect from.
 */
export function makeDistortionCallback(
  label: string,
  targetWindow: SandboxRealm,
  allowedHosts: string[],
  onBlocked?: SandboxBlockedListener,
) {
  const shared = makeSandboxDistortionCallback(
    `data-app ${label}`,
    (message) => {
      if (onBlocked) {
        onBlocked({ type: "api", message });
        return;
      }
      // The thrown error usually reaches the developer only as an opaque
      // cross-realm `#<Object>` (an unhandled async rejection), so log the real
      // reason here — at the block point, where the console stack still points at
      // the data-app code that called the blocked API.
      console.error(message);
    },
  );
  const onBlockedNetwork =
    onBlocked &&
    ((info: SandboxBlockedNetworkInfo) =>
      onBlocked({ type: "network", ...info }));
  const sandboxFetch = makeSandboxFetch(
    targetWindow,
    allowedHosts,
    label,
    onBlockedNetwork,
  );
  const sandboxXhr = makeSandboxXhr(
    targetWindow,
    allowedHosts,
    label,
    onBlockedNetwork,
  );

  return function distortionCallback(value: object): object {
    const createElementDistortion = makeCreateElementDistortion(value, shared);

    if (createElementDistortion) {
      return createElementDistortion;
    }

    if (sandboxFetch && value === targetWindow.fetch) {
      return sandboxFetch;
    }
    if (sandboxXhr && value === targetWindow.XMLHttpRequest) {
      return sandboxXhr;
    }
    return shared(value);
  };
}
