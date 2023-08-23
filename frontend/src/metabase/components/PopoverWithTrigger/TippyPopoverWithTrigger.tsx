import { useCallback, useImperativeHandle, useState } from "react";
import type { RefObject } from "react";

import type { ControlledPopoverWithTriggerProps } from "./ControlledPopoverWithTrigger";
import ControlledPopoverWithTrigger from "./ControlledPopoverWithTrigger";

export type TippyPopoverWithTriggerRef = {
  open: () => void;
  close: () => void;
};

export type TippyPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
  popoverRef?: RefObject<TippyPopoverWithTriggerRef>;
} & Omit<ControlledPopoverWithTriggerProps, "visible" | "onClose" | "onOpen">;

function UncontrolledPopoverWithTrigger({
  isInitiallyVisible,
  popoverRef,
  ...props
}: TippyPopoverWithTriggerProps) {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const onOpen = useCallback(() => setVisible(true), []);
  const onClose = useCallback(() => setVisible(false), []);

  useImperativeHandle(popoverRef, () => ({
    open: onOpen,
    close: onClose,
  }));

  return (
    <ControlledPopoverWithTrigger
      {...props}
      visible={visible}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UncontrolledPopoverWithTrigger;
