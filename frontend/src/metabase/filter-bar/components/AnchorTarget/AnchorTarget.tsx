import type { VirtualElement } from "@floating-ui/dom";
import { forwardRef, useImperativeHandle } from "react";

export type GetAnchorRect = (() => DOMRect | null) | null | undefined;

type AnchorTargetProps = {
  getRect: GetAnchorRect;
};

export const AnchorTarget = forwardRef<VirtualElement, AnchorTargetProps>(
  function AnchorTarget({ getRect }, ref) {
    useImperativeHandle(
      ref,
      () => ({ getBoundingClientRect: () => getRect?.() ?? new DOMRect() }),
      [getRect],
    );
    return null;
  },
);
