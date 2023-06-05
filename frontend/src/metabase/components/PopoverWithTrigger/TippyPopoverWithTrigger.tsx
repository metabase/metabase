import { useState, useCallback } from "react";

import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
} from "./ControlledPopoverWithTrigger";

export type TippyPopoverWithTriggerProps = {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UncontrolledPopoverWithTrigger;
