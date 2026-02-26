import { forwardRef, useImperativeHandle } from "react";

type ExternalMenuTargetProps = {
  element: Element | null;
};

/**
 * Mantine's Menu.Target expects a React element it can attach a ref to.
 * For TipTap suggestions we often already have a real DOM node (`decorationNode`).
 *
 * This component bridges those worlds by forwarding the ref to an existing DOM element.
 */
export const ExternalMenuTarget = forwardRef<
  Element | null,
  ExternalMenuTargetProps
>(function ExternalMenuTarget({ element }, ref) {
  useImperativeHandle(ref, () => element, [element]);

  return null;
});
