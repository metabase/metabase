import type { ModalBaseProps } from "@mantine/core";

/** Mantine loads overlays (floating elements like Modals and HoverCards)
 * inside portals. A portal is a <div> appended to the DOM. If an overlay's
 * portal is rendered eagerly, it will be added to the DOM when the overlay is
 * mounted, even if the overlay is hidden. PreventEagerPortal ensures that the
 * portal is created lazily, when the overlay is shown. This stops any overlay
 * that is in a portal from popping up underneath another one already on the
 * page. */
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
