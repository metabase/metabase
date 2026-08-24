import { makeSandboxDistortionCallback } from "metabase/utils/scripts-sandbox";

import { makeSandboxFetch } from "./allowed-hosts";
import { makeCreateElementDistortion } from "./create-element";
import type {
  SandboxBlockedListener,
  SandboxBlockedNetworkInfo,
  SandboxRealm,
} from "./types";

/**
 * Data-app Near-Membrane distortion callback. Reuses the shared
 * `utils/scripts-sandbox` callback (same fetch/XHR/DOM blocking as custom-viz), but
 * gives `fetch` an allowlist when the app declares `allowed_hosts` — otherwise it
 * falls through to the shared hard block (default: no network). `XMLHttpRequest` is
 * never allowlisted (it can't opt out of following a redirect to the instance), so
 * `blockHostRealmXhr` hard-blocks it. No per-plugin DOM scoping like custom-viz: a
 * data app is a full-page route owned by one bundle, with no sibling DOM.
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

  // Ancestor realms reachable from the sandboxed iframe.
  // Near-Membrane remaps the guest's `window.parent` to the real parent (the
  // same-origin main app) — a realm it never wrapped, so its `fetch` isn't gated.
  // Redirect every ancestor window, plus the frame element reachable via
  // `ownerDocument.defaultView`, to the gated target: a valid Window->Window
  // distortion, so `window.parent`/`frameElement` resolve to THIS realm (where
  // `fetch`/`XMLHttpRequest` are gated). Captured before the membrane is built,
  // while the ancestors are still reachable.
  const realm = targetWindow as unknown as Window;

  // A same-origin child frame's realm is reachable ONLY through
  // `iframe.contentWindow` / `contentDocument.defaultView` (Near-Membrane isolates
  // `window.frames`). Gate exactly those getters on the realm-creating element
  // prototypes, so such a frame — e.g. the transient clone iframe html2canvas
  // creates during a chart export — collapses to THIS gated realm. Deliberately
  // narrow: matching the whole `Window` type instead fires on every window the SDK
  // resolves at load and blows the stack.
  const getterOf = (proto: object, key: string) =>
    Object.getOwnPropertyDescriptor(proto, key)?.get;
  const realmCreatingProtos = [
    HTMLIFrameElement,
    HTMLFrameElement,
    HTMLObjectElement,
    HTMLEmbedElement,
  ].map((ctor) => ctor.prototype);
  const contentWindowGetters = new Set<unknown>(
    realmCreatingProtos
      .map((p) => getterOf(p, "contentWindow"))
      .filter(Boolean),
  );
  const contentDocumentGetters = new Set<unknown>(
    realmCreatingProtos
      .map((p) => getterOf(p, "contentDocument"))
      .filter(Boolean),
  );
  const getGatedRealm = () => realm;
  const getNull = () => null;

  const ancestors = new Set<unknown>();

  // Walk up until a window is its own parent (the top) or a cross-origin
  // ancestor makes `.parent` throw — every real chain terminates one of those ways.
  let ancestor: Window | null = realm;
  while (ancestor) {
    let up: Window | null;

    try {
      up = ancestor.parent;
    } catch {
      break;
    }

    if (!up || up === ancestor) {
      break;
    }

    ancestors.add(up);
    ancestor = up;
  }

  try {
    if (realm.top) {
      ancestors.add(realm.top);
    }
  } catch {
    // top unreachable — nothing to redirect
  }

  try {
    if (realm.frameElement) {
      ancestors.add(realm.frameElement);
    }
  } catch {
    // frameElement unreachable — nothing to redirect
  }

  try {
    if (realm.opener) {
      ancestors.add(realm.opener);
    }
  } catch {
    // opener unreachable — nothing to redirect
  }

  return function distortionCallback(value: object): object {
    const createElementDistortion = makeCreateElementDistortion(value, shared);

    if (createElementDistortion) {
      return createElementDistortion;
    }

    if (sandboxFetch && value === targetWindow.fetch) {
      return sandboxFetch;
    }

    if (ancestors.has(value)) {
      return realm;
    }

    // A child frame's `contentWindow` resolves to the gated realm; its
    // `contentDocument` to null — so neither reaches a live child realm.
    if (contentWindowGetters.has(value)) {
      return getGatedRealm;
    }

    if (contentDocumentGetters.has(value)) {
      return getNull;
    }

    return shared(value);
  };
}
