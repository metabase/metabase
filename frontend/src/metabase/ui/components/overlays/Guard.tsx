import type { ModalBaseProps } from "@mantine/core";

/** Prevent eager portal rendering.
 *
 * The point of doing this is to stop any floating element from popping up
 * underneath another one already on the page */
export const Guard = <
  T extends Partial<
    Pick<ModalBaseProps, "withinPortal" | "opened" | "children">
  >,
>(
  props: T,
) => {
  const { withinPortal = true, opened, children } = props;
  if (withinPortal && !opened) {
    return null;
  }
  return <>{children}</>;
};
