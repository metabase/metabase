import React, { useState, useEffect, useRef, useCallback } from "react";
import cx from "classnames";

import TippyPopover, { ITippyPopoverProps } from "./TippyPopover";

export type ControlledPopoverWithTriggerProps = {
  onOpen: () => void;
  onClose: () => void;
  trigger: Trigger;
  children: Children;
  isOpen: boolean;
  disabled?: boolean;
  popoverProps?: ITippyPopoverProps;
} & TriggerStyleProps;

type Children = React.ReactNode | ((props: ChildrenProps) => React.ReactNode);
type ChildrenProps = {
  onClose?: () => void;
};

type Trigger = React.ReactNode | ((props: TriggerFnProps) => React.ReactNode);
type TriggerFnProps = {
  isOpen: boolean;
  onClick: () => void;
};
type TriggerStyleProps = {
  triggerClasses?: string;
  triggerStyle?: React.CSSProperties;
  triggerClassesOpen?: string;
  triggerClassesClose?: string;
};

function getTrigger(
  trigger: Trigger,
  {
    triggerClasses,
    triggerStyle,
    triggerClassesOpen,
    triggerClassesClose,
    disabled,
    handleTriggerClick,
    isOpen,
  }: TriggerStyleProps & {
    disabled?: boolean;
    isOpen: boolean;
    handleTriggerClick: () => void;
  },
): React.ReactElement<any, string | React.JSXElementConstructor<any>> {
  if (typeof trigger === "function") {
    return trigger({
      isOpen,
      onClick: handleTriggerClick,
    });
  }

  return (
    <button
      className={cx(
        triggerClasses,
        isOpen && triggerClassesOpen,
        !isOpen && triggerClassesClose,
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
}

function getContent(children: Children, onClose?: () => void): React.ReactNode {
  if (typeof children === "function") {
    return children({ onClose });
  }

  return children;
}

function ControlledPopoverWithTrigger({
  triggerClasses,
  triggerStyle,
  triggerClassesOpen,
  triggerClassesClose,
  trigger,
  children,
  disabled,
  isOpen,
  onOpen,
  onClose,
  popoverProps = {},
}: ControlledPopoverWithTriggerProps) {
  const handleTriggerClick = () => {
    if (!disabled) {
      onOpen();
    }
  };

  const computedTrigger = getTrigger(trigger, {
    triggerClasses,
    triggerStyle,
    triggerClassesOpen,
    triggerClassesClose,
    handleTriggerClick,
    isOpen,
    disabled,
  });

  const popoverContent = getContent(children, onClose);

  return (
    <TippyPopover
      interactive
      placement="bottom-start"
      {...popoverProps}
      visible={isOpen}
      disabled={disabled}
      content={popoverContent}
      onClose={onClose}
    >
      {computedTrigger}
    </TippyPopover>
  );
}

export default ControlledPopoverWithTrigger;
