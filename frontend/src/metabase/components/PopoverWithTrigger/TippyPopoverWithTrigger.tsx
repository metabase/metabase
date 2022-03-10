import React, { useState, useCallback } from "react";

import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
} from "./ControlledPopoverWithTrigger";

type TippyPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
} & Omit<ControlledPopoverWithTriggerProps, "visible" | "onClose" | "onOpen">;

function UncontrolledPopoverWithTrigger({
  isInitiallyVisible,
  ...props
}: TippyPopoverWithTriggerProps) {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const onOpen = useCallback(() => setVisible(true), []);
  const onClose = useCallback(() => setVisible(false), []);

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
