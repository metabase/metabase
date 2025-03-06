import type { ModalProps } from "@mantine/core";

/** Prevent eager portal rendering.
 *
 * This stops any overlay that is in a portal from popping up
 * underneath another one already on the page */
export const PreventEagerPortal = <
  T extends Partial<
    Pick<ModalProps, "withinPortal" | "opened" | "children" | "stackId">
  >,
>(
  props: T,
) => {
  const { withinPortal = true, opened = true, stackId, children } = props;
  if (withinPortal && !opened && !stackId) {
    return null;
  }
  return <>{children}</>;
};
