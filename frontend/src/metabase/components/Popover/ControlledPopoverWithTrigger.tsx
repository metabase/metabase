import React from "react";
import cx from "classnames";
import _ from "underscore";

import TippyPopover, { ITippyPopoverProps } from "./TippyPopover";

export type ControlledPopoverWithTriggerProps = Omit<
  ITippyPopoverProps,
  // this is explicitly a "controlled" component, so we need to remove TippyPopover's optional `visible` prop and make it required
  "children" | "visible"
> &
  OptionalTriggerStyleProps &
  RequiredProps;

type RequiredProps = {
  trigger: Trigger;
  children: Children;
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

type Children = React.ReactNode | ((props: ChildrenProps) => React.ReactNode);
type ChildrenProps = {
  onClose: () => void;
};

type Trigger = React.ReactNode | ((props: TriggerFnProps) => ComputedTrigger);
type TriggerFnProps = {
  visible: boolean;
  onClick: () => void;
};
type ComputedTrigger = React.ReactElement<
  any,
  string | React.JSXElementConstructor<any>
>;

function ControlledPopoverWithTrigger({
  triggerClasses,
  triggerStyle,
  triggerClassesOpen,
  triggerClassesClose,
  trigger,
  children,
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

  const computedTrigger = _.isFunction(trigger) ? (
    trigger({ visible, onClick: handleTriggerClick })
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
      {trigger}
    </button>
  );

  const popoverContent = _.isFunction(children)
    ? children({ onClose })
    : children;

  return (
    <TippyPopover
      interactive
      placement="bottom-start"
      {...popoverProps}
      visible={visible}
      disabled={disabled}
      content={popoverContent}
      onClose={onClose}
    >
      {computedTrigger}
    </TippyPopover>
  );
}

export default ControlledPopoverWithTrigger;
