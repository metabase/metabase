import React, { useState, useCallback } from "react";

import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
} from "./ControlledPopoverWithTrigger";

type UncontrolledPopoverWithTriggerProps = {
  isInitiallyOpen?: boolean;
} & Omit<ControlledPopoverWithTriggerProps, "isOpen" | "onClose" | "onOpen">;

function UncontrolledPopoverWithTrigger({
  isInitiallyOpen,
  ...props
}: UncontrolledPopoverWithTriggerProps) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen || false);

  const onOpen = useCallback(() => setIsOpen(true), []);
  const onClose = useCallback(() => setIsOpen(false), []);

  return (
    <ControlledPopoverWithTrigger
      {...props}
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}

export default UncontrolledPopoverWithTrigger;
