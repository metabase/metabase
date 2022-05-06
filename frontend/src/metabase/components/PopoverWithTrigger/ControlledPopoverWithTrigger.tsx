import React from "react";
import cx from "classnames";
import _ from "underscore";

import TippyPopover, {
  ITippyPopoverProps,
  PopoverContentArgs,
} from "metabase/components/Popover/TippyPopover";

import { TriggerButton } from "./ControlledPopoverWithTrigger.styled";

export type ControlledPopoverWithTriggerProps = Omit<
  ITippyPopoverProps,
  // this is explicitly a "controlled" component, so we need to remove TippyPopover's optional `visible` prop and make it required
  "children" | "visible"
> &
  OptionalTriggerStyleProps & {
    renderTrigger?: RenderTrigger;
    triggerContent?: React.ReactNode;
    popoverContent: PopoverWithTriggerContent;
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
  };

type OptionalTriggerStyleProps = {
  triggerClasses?: string;
  triggerStyle?: React.CSSProperties;
  triggerClassesOpen?: string;
  triggerClassesClose?: string;
};

export type PopoverWithTriggerContent =
  | React.ReactNode
  | ((args: PopoverWithTriggerContentArgs) => React.ReactNode);
type PopoverWithTriggerContentArgs = {
  closePopover: () => void;
} & PopoverContentArgs;

export type RenderTrigger = (
  args: RenderTriggerArgs,
) => React.ReactElement<any, string | React.JSXElementConstructor<any>>;
type RenderTriggerArgs = {
  visible: boolean;
  onClick: () => void;
};

function ControlledPopoverWithTrigger({
  triggerClasses,
  triggerStyle,
  triggerClassesOpen,
  triggerClassesClose,
  renderTrigger,
  triggerContent,
  popoverContent,
  disabled,
  visible,
  onOpen,
  onClose,
  ...popoverProps
}: ControlledPopoverWithTriggerProps) {
  const handleTriggerClick = () => {
    if (!disabled) {
      onOpen();
    }
  };

  const computedTrigger = _.isFunction(renderTrigger) ? (
    renderTrigger({ visible, onClick: handleTriggerClick })
  ) : (
    <TriggerButton
      as="a"
      role="button"
      disabled={disabled}
      className={cx(
        triggerClasses,
        visible && triggerClassesOpen,
        !visible && triggerClassesClose,
      )}
      aria-disabled={disabled}
      style={triggerStyle}
      onClick={handleTriggerClick}
    >
      {triggerContent}
    </TriggerButton>
  );

  const computedPopoverContent = _.isFunction(popoverContent)
    ? ({ maxHeight }: PopoverContentArgs) =>
        popoverContent({ closePopover: onClose, maxHeight })
    : popoverContent;

  return (
    <TippyPopover
      interactive
      placement="bottom-start"
      {...popoverProps}
      visible={visible}
      disabled={disabled}
      content={computedPopoverContent}
      onClose={onClose}
    >
      {computedTrigger}
    </TippyPopover>
  );
}

export default ControlledPopoverWithTrigger;
