import type { ModalBaseProps } from "@mantine/core";

/** Prevent eager portal rendering */
export const Guard = <
  T extends Partial<
    Pick<ModalBaseProps, "withinPortal" | "opened" | "children">
  >,
>(
  props: T,
) => {
  const { withinPortal, opened, children } = props;
  if (withinPortal && opened) {
    return null;
  }
  return <>{children}</>;
};
