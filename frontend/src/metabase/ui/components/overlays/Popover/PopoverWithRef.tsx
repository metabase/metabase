import {
  type PropsWithChildren,
  type Ref,
  forwardRef,
  useMemo,
  useRef,
} from "react";

import { Popover, type PopoverProps } from "./index";

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
      if (typeof ref === "function") {
        ref(anchorRef.current);
      }

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
