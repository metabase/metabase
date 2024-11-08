import type { ModalBaseProps } from "@mantine/core";

/** To avoid z-index complications, change the props so that the portal doesn't
 * exist when the floating element is closed
 *
 * FIXME: Should this instead return null if withinPortal is true and opened is false?
 */
export const withLazyPortal = <
  T extends Partial<Pick<ModalBaseProps, "withinPortal" | "opened">>,
>(
  props: T,
): T => {
  const { withinPortal, opened } = props;
  return { ...props, withinPortal: withinPortal && opened };
};
