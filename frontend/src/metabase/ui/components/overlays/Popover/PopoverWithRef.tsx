import {
  type PropsWithChildren,
  type Ref,
  forwardRef,
  useLayoutEffect,
  useMemo,
} from "react";

import { Popover, type PopoverProps } from "./index";

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
  const Target = useMemo(() => {
    return forwardRef(function Target(
      { anchorEl }: { anchorEl: Element | null },
      ref: Ref<Element> | null,
    ) {
      useLayoutEffect(() => {
        if (typeof ref === "function") {
          ref(anchorEl);
        }
      }, [ref, anchorEl]);

      return null;
    });
  }, []);

  // A Mantine Popover mounted with a null reference is never positioned, even
  // if the reference is wired later — mount it only once the anchor exists
  if (!anchorEl) {
    return null;
  }

  return (
    <Popover {...popoverProps}>
      <Popover.Target>
        <Target anchorEl={anchorEl} />
      </Popover.Target>
      <Popover.Dropdown data-testid={popoverContentTestId}>
        {children}
      </Popover.Dropdown>
    </Popover>
  );
};
