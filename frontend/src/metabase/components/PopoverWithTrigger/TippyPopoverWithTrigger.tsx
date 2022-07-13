import React, { useState, useCallback } from "react";

import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
} from "./ControlledPopoverWithTrigger";

export type TippyPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
  afterOpen?: () => void;
  afterClose?: () => void;
} & Omit<ControlledPopoverWithTriggerProps, "visible" | "onClose" | "onOpen">;

function UncontrolledPopoverWithTrigger({
  isInitiallyVisible,
  afterOpen,
  afterClose,
  ...props
}: TippyPopoverWithTriggerProps) {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const onOpen = useCallback(() => {
    setVisible(true);
    typeof afterOpen === "function" && afterOpen();
  }, [afterOpen]);

  const onClose = useCallback(() => {
    setVisible(false);
    typeof afterClose === "function" && afterClose();
  }, [afterClose]);

  return (
    <ControlledPopoverWithTrigger
      {...props}
      visible={visible}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}

export default UncontrolledPopoverWithTrigger;
