/** This is a workaround for a bug in Mantine: when certain Mantine overlays
 * appear above a Mantine Modal, only the Modal's portal has
 * aria-hidden="false", while the higher overlay's aria-hidden is "true" */
export const hidden = { hidden: true };
