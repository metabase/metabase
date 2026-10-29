import {
  type Factory,
  Popover as MantinePopover,
  type PopoverDropdownProps,
  type PopoverStylesNames,
  factory,
} from "@mantine/core";
import { useIsomorphicEffect, useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";

import ZIndex from "metabase/css/core/z-index.module.css";
import { PreventEagerPortal } from "metabase/ui/components/utils/PreventEagerPortal";

import { OverlayStackItem } from "../overlay-stack";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type PopoverDropdownFactory = Factory<{
  props: PopoverDropdownProps;
  ref: HTMLDivElement;
  stylesNames: PopoverStylesNames;
  compound: true;
}>;

export const PopoverDropdown = factory<PopoverDropdownFactory>(
  function PopoverDropdown({ children, ...props }, ref) {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const isShown = useIsShown(element);
    const mergedRef = useMergedRef(ref, setElement);

    return (
      <PreventEagerPortal {...props}>
        <MantinePopoverDropdown
          {...props}
          className={cx(props.className, ZIndex.Overlay)}
          data-element-id="mantine-popover"
          ref={mergedRef}
        >
          <OverlayStackItem opened={isShown} />
          {children}
        </MantinePopoverDropdown>
      </PreventEagerPortal>
    );
  },
);
PopoverDropdown.classes = MantinePopoverDropdown.classes;
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;

/** Mantine hides kept-mounted dropdowns with an inline `display: none`. */
function useIsShown(element: HTMLElement | null) {
  const [isShown, setIsShown] = useState(false);

  useIsomorphicEffect(() => {
    if (!element) {
      setIsShown(false);
      return;
    }

    const update = () => setIsShown(element.style.display !== "none");
    update();

    const observer = new MutationObserver(update);
    observer.observe(element, { attributes: true, attributeFilter: ["style"] });

    return () => observer.disconnect();
  }, [element]);

  return isShown;
}
