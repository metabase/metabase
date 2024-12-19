import type { ModalBaseProps } from "@mantine/core";

/** Prevent eager portal rendering.
 *
 * This stops any overlay that is in a portal from popping up
 * underneath another one already on the page */
export const PreventEagerPortal = <
  T extends Partial<
    Pick<ModalBaseProps, "withinPortal" | "opened" | "children">
  >,
>(
  props: T,
) => {
  const { withinPortal = true, opened = true, children } = props;
  if (withinPortal && !opened) {
    return null;
  }
  return <>{children}</>;
};
