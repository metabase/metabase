import type { WidgetMount } from "custom-viz";

import type { CustomVizPluginId } from "metabase-types/api";

/**
 * Host-realm symbol used to brand widget-mount functions that the host
 * itself allocated. Plugin code lives in a separate near-membrane realm
 * and cannot reproduce this symbol — `Symbol(...)` is realm-local, we
 * never hand the symbol to the sandbox, and `Symbol("desc")` produces a
 * fresh value on every call regardless of description — so the brand
 * cannot be forged from inside a plugin.
 *
 * This is the only signal the host trusts when deciding whether a
 * `widget` value should be driven via `mount`/`update`/`unmount` instead
 * of being rendered as a React component. Anything the plugin returns
 * directly — including brand markers it sets on its own values — is
 * ignored.
 */
const HOST_TRUSTED_MOUNT = Symbol("metabase.host.trusted-widget-mount");

/**
 * Host-realm symbol used to carry the originating plugin id alongside a
 * trusted mount, so the host driver can stamp the right
 * `data-plugin-sandbox=<id>` attribute on its container element. Without
 * this attribute the sandbox's DOM-scoping distortion treats the widget
 * container as out-of-scope and swaps every Node crossing the membrane
 * with a detached decoy, leaving the widget invisible.
 */
const HOST_TRUSTED_MOUNT_PLUGIN_ID = Symbol(
  "metabase.host.trusted-widget-mount-plugin-id",
);

type TrustedMount = WidgetMount & {
  [HOST_TRUSTED_MOUNT]?: true;
  [HOST_TRUSTED_MOUNT_PLUGIN_ID]?: CustomVizPluginId;
};

/**
 * Wrap a plugin-supplied function-shaped widget into a host-trusted
 * `WidgetMount`. The wrapper is host-allocated and stamped with the
 * host-realm trust symbol plus the originating plugin id; calling it
 * forwards to the plugin's mount fn across the membrane.
 *
 * If the plugin's value isn't actually a real mount handle (e.g. they
 * smuggled a React component or any other function), invoking it as
 * `(container, initialProps)` will return a non-handle value and
 * subsequent `update`/`unmount` calls will fail plugin-side. Critically,
 * the plugin's React tree never reaches the host React reconciler — the
 * worst-case outcome is a broken widget render, not a host-tree escape.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  pluginId: CustomVizPluginId,
): WidgetMount {
  const mount: TrustedMount = (container, initialProps) =>
    pluginWidget(container, initialProps);
  Object.defineProperty(mount, HOST_TRUSTED_MOUNT, {
    value: true,
    enumerable: false,
  });
  Object.defineProperty(mount, HOST_TRUSTED_MOUNT_PLUGIN_ID, {
    value: pluginId,
    enumerable: false,
  });
  return mount;
}

/**
 * Returns `true` only for `WidgetMount` values that the host itself
 * allocated via `wrapPluginWidget`. Plugin-controlled values (including
 * those that try to spoof a brand by adding own properties) cannot pass
 * this check, because the host-realm symbol used here is unreachable
 * from inside the plugin sandbox.
 */
export function isWidgetMount(value: unknown): value is WidgetMount {
  return (
    typeof value === "function" &&
    (value as { [HOST_TRUSTED_MOUNT]?: unknown })[HOST_TRUSTED_MOUNT] === true
  );
}

/**
 * Recover the plugin id stamped onto a host-trusted mount by
 * `wrapPluginWidget`. Returns `undefined` for anything else, including
 * plugin-controlled values that may carry plausible-looking brands.
 */
export function getWidgetMountPluginId(
  value: WidgetMount,
): CustomVizPluginId | undefined {
  if (!isWidgetMount(value)) {
    return undefined;
  }
  return (value as TrustedMount)[HOST_TRUSTED_MOUNT_PLUGIN_ID];
}
