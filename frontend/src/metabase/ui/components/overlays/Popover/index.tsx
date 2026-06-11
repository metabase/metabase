import type { PopoverDropdownProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import { type Ref, type RefObject, forwardRef, useEffect, useRef } from "react";

import ZIndex from "metabase/css/core/z-index.module.css";
import { PreventEagerPortal } from "metabase/ui";
import { useSequencedContentCloseHandler } from "metabase/ui/hooks/use-sequenced-content-close-handler";

export type { PopoverProps } from "@mantine/core";
export { popoverOverrides } from "./Popover.config";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type ExtendedPopoverDropdownProps = PopoverDropdownProps & {
  // Registers the dropdown in the RENDERED_POPOVERS stack while it is open, so
  // that a parent registered there (legacy Modal via OnClickOutsideWrapper)
  // does not react to Esc/outside clicks meant for this dropdown. The callback
  // must actually close the popover: inside a legacy Modal the EventSandbox
  // swallows mousedown before it reaches Mantine's document-level
  // closeOnClickOutside listener, so the stack (window capture) is the only
  // thing that can close the popover on an outside click there.
  // TODO: remove when the legacy Modal / RENDERED_POPOVERS stack is no longer used
  setupSequencedCloseHandler?: () => void;
};

type SequencedCloseHandlerSetupProps = {
  dropdownRef: RefObject<HTMLDivElement>;
  onClose: () => void;
};

// Rendered inside the dropdown so that it is mounted only while the popover is
// open — registering on the wrapper itself would permanently occupy the top of
// the stack and block the parent modal from ever closing
const SequencedCloseHandlerSetup = ({
  dropdownRef,
  onClose,
}: SequencedCloseHandlerSetupProps) => {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setupCloseHandler(dropdownRef.current, () => onCloseRef.current());
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler, dropdownRef]);

  return null;
};

const PopoverDropdown = forwardRef(function PopoverDropdown(
  { setupSequencedCloseHandler, ...props }: ExtendedPopoverDropdownProps,
  ref: Ref<HTMLDivElement>,
) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mergedRef = useMergedRef(ref, dropdownRef);

  return (
    <PreventEagerPortal {...props}>
      <MantinePopoverDropdown
        {...props}
        className={cx(props.className, ZIndex.Overlay)}
        data-element-id="mantine-popover"
        ref={mergedRef}
      >
        {setupSequencedCloseHandler && (
          <SequencedCloseHandlerSetup
            dropdownRef={dropdownRef}
            onClose={setupSequencedCloseHandler}
          />
        )}
        {props.children}
      </MantinePopoverDropdown>
    </PreventEagerPortal>
  );
});

export const Popover = Object.assign(MantinePopover, {
  Dropdown: Object.assign(PopoverDropdown, {
    displayName: MantinePopoverDropdown.displayName,
  }),
});
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";
