import React from "react";
import cx from "classnames";
import _ from "underscore";

import TippyPopover, {
  ITippyPopoverProps,
} from "metabase/components/Popover/TippyPopover";

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
  onClose: () => void;
};

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
    <button
      className={cx(
        triggerClasses,
        visible && triggerClassesOpen,
        !visible && triggerClassesClose,
        disabled && "cursor-default",
        "no-decoration",
      )}
      aria-disabled={disabled}
      style={triggerStyle}
      onClick={handleTriggerClick}
    >
      {triggerContent}
    </button>
  );

  const computedPopoverContent = _.isFunction(popoverContent)
    ? popoverContent({ onClose })
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
