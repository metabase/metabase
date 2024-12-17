export const OVERLAY_Z_INDEX = 200;

/** This constant is used to work around a bug in Mantine: when certain Mantine
 * overlays appear above a Mantine Modal, only the Modal's portal has
 * aria-hidden="false", while the higher overlay's aria-hidden is "true" To
 * find the higher overlay we need to do things like:
 *
 *  await within(portalRoot).findByRole("dialog", { name: /^Mantine HoverCard$/i, { hidden: true } });
 *
 * This is a reusable constant in order to provide a single place where this is
 * documented.
 * */
export const hidden = { hidden: true };
