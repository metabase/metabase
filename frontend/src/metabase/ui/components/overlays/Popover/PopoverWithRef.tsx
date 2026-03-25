import type { ReferenceElement, VirtualElement } from "@floating-ui/dom";
import {
  type PropsWithChildren,
  type Ref,
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { Popover, type PopoverProps } from "./index";

export interface VirtualAnchor extends VirtualElement {
  contains: (node: Node | null) => boolean;
}

// Creates a Floating UI virtual element that tracks the real element's live
// position. When the element is disconnected from the DOM (e.g. removed by
// virtual scrolling), it returns the last known rect to prevent Floating UI
// from repositioning the popover to (0,0).
export function createVirtualAnchor(element: Element): VirtualAnchor {
  let lastRect = element.getBoundingClientRect();
  return {
    getBoundingClientRect: () => {
      if (element.isConnected) {
        lastRect = element.getBoundingClientRect();
      }
      return lastRect;
    },
    // Delegates to the real element for Mantine's click-outside detection
    contains: (node: Node | null) => element.contains(node),
  };
}

// Not something we want to use a ton. This is only meant to help migrate
// to Mantine popovers in situations where we pass an anchor as a reference for
// positioning purposes.
export const PopoverWithRef = ({
  anchorEl,
  children,
  popoverContentTestId,
  ...popoverProps
}: PropsWithChildren &
  PopoverProps & {
    anchorEl: Element | null;
    popoverContentTestId?: string;
  }) => {
  // Wrap the anchor in a virtual element that tracks its live position but
  // falls back to the last known rect when removed from the DOM.
  const virtualAnchor = useMemo(
    () => (anchorEl ? createVirtualAnchor(anchorEl) : null),
    [anchorEl],
  );

  const anchorRef = useRef(virtualAnchor);
  anchorRef.current = virtualAnchor;

  const Target = useMemo(() => {
    return forwardRef(function Target(
      _props: unknown,
      ref: Ref<Element> | null,
    ) {
      useLayoutEffect(() => {
        // Mantine types the ref as Ref<Element>, but internally it forwards
        // to Floating UI's setReference which accepts ReferenceElement
        // (Element | VirtualElement).
        const setRef = ref as
          | ((instance: ReferenceElement | null) => void)
          | null;
        if (typeof setRef === "function") {
          setRef(anchorRef.current);
        }
      }, [ref]);

      return null;
    });
  }, []); // should use ref to prevent new components being created

  return (
    <Popover {...popoverProps}>
      <Popover.Target>
        <Target />
      </Popover.Target>
      <Popover.Dropdown data-testid={popoverContentTestId}>
        {children}
      </Popover.Dropdown>
    </Popover>
  );
};
