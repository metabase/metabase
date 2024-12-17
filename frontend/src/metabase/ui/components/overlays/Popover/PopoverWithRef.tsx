import {
  type PropsWithChildren,
  type Ref,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { Popover, type PopoverProps } from "./index";

// Not something we want to use a ton. This is only meant to help migrate
// to Mantine popovers in situations where we pass an anchor as a reference for
// positioning purposes.
export const PopoverWithRef = ({
  anchorEl,
  children,
  ...popoverProps
}: PropsWithChildren &
  PopoverProps & {
    anchorEl: Element | null;
  }) => {
  const anchorRef = useRef(anchorEl);
  anchorRef.current = anchorEl;

  const Target = useMemo(() => {
    return forwardRef(function Target(
      _props: unknown,
      ref: Ref<Element> | null,
    ) {
      useEffect(() => {
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
      <Popover.Dropdown>{children}</Popover.Dropdown>
    </Popover>
  );
};
