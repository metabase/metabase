import type { PopoverDropdownProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import cx from "classnames";
import { type Ref, forwardRef, useEffect } from "react";

import { useSequencedContentCloseHandler } from "metabase/common/hooks/use-sequenced-content-close-handler";
import ZIndex from "metabase/css/core/z-index.module.css";
import { PreventEagerPortal } from "metabase/ui";

export type { PopoverProps } from "@mantine/core";
export { popoverOverrides } from "./Popover.config";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type ExtendedPopoverDropdownProps = PopoverDropdownProps & {
  // Prevent parent TippyPopover from closing when selecting an item
  // TODO: remove when TippyPopover is no longer used
  setupSequencedCloseHandler?: boolean;
};

const PopoverDropdown = forwardRef(function PopoverDropdown(
  props: ExtendedPopoverDropdownProps,
  ref: Ref<HTMLDivElement>,
) {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    if (!props.setupSequencedCloseHandler) {
      return;
    }
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler, props.setupSequencedCloseHandler]);

  return (
    <PreventEagerPortal {...props}>
      <MantinePopoverDropdown
        {...props}
        className={cx(props.className, ZIndex.Overlay)}
        data-element-id="mantine-popover"
        ref={ref}
      />
    </PreventEagerPortal>
  );
});

// @ts-expect-error -- our types are better
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;
// @ts-expect-error -- our types are better
MantinePopover.Dropdown = PopoverDropdown;

export const Popover = MantinePopover;
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";
