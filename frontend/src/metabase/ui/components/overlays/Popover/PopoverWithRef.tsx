import {
  type PropsWithChildren,
  type Ref,
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { Popover, type PopoverProps } from "./index";

// Elements that have been patched with a stable getBoundingClientRect.
const patchedElements = new WeakSet<Element>();

// When a DOM element is removed (e.g. by virtual scroll),
// getBoundingClientRect() returns {top:0, left:0, width:0, height:0}.
// This causes Floating UI to flash the popover at the viewport origin.
// Patching the method to cache the last known rect prevents this.
function ensureStableRect(element: Element): void {
  if (patchedElements.has(element)) {
    return;
  }

  const original = element.getBoundingClientRect.bind(element);
  let lastRect = original();

  element.getBoundingClientRect = () => {
    if (element.isConnected) {
      lastRect = original();
    }
    return lastRect;
  };

  patchedElements.add(element);
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
  if (anchorEl) {
    ensureStableRect(anchorEl);
  }

  const anchorRef = useRef(anchorEl);
  anchorRef.current = anchorEl;

  const Target = useMemo(() => {
    return forwardRef(function Target(
      _props: unknown,
      ref: Ref<Element> | null,
    ) {
      useLayoutEffect(() => {
        if (typeof ref === "function") {
          ref(anchorRef.current);
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
