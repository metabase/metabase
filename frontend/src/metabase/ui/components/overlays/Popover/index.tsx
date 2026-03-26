import type { PopoverDropdownProps, PopoverTargetProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import cx from "classnames";
import {
  Children,
  type ReactElement,
  type Ref,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useRef,
} from "react";

import { useSequencedContentCloseHandler } from "metabase/common/hooks/use-sequenced-content-close-handler";
import ZIndex from "metabase/css/core/z-index.module.css";
import { isTouchDevice } from "metabase/lib/browser";
import { PreventEagerPortal } from "metabase/ui";

export type { PopoverProps } from "@mantine/core";
export { popoverOverrides } from "./Popover.config";

const MantinePopoverTarget = MantinePopover.Target;
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

/**
 * iOS Safari may not synthesize `mousedown`/`click` events on the first tap
 * for certain DOM/CSS configurations. This wrapper attaches a native `touchend`
 * listener that dispatches a real `click` event, ensuring Popover targets
 * respond to touch on the first tap.
 *
 * A native listener is used because some wrapper components (e.g. dnd-kit
 * sortable items) do not forward unknown React props to the DOM.
 *
 * @see https://github.com/facebook/react/issues/7635
 * @see https://github.com/facebook/react/issues/134
 */
function onTouchEnd(e: TouchEvent) {
  e.preventDefault();
  e.target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function PopoverTarget({ children, ...props }: PopoverTargetProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isTouchDevice()) {
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    node.addEventListener("touchend", onTouchEnd);
    return () => node.removeEventListener("touchend", onTouchEnd);
  }, []);

  const child = Children.only(children);

  const enhanced = isValidElement(child)
    ? cloneElement(child as ReactElement<Record<string, unknown>>, { ref })
    : child;

  return <MantinePopoverTarget {...props}>{enhanced}</MantinePopoverTarget>;
}

// @ts-expect-error -- our types are better
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;
// @ts-expect-error -- our types are better
MantinePopover.Dropdown = PopoverDropdown;
// @ts-expect-error -- replacing Target with touch-friendly wrapper
MantinePopover.Target = PopoverTarget;

export const Popover = MantinePopover;
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";
