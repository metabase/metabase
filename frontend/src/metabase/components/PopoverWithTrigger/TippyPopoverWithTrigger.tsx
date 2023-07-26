import { forwardRef, useCallback, useImperativeHandle, useState } from "react";

import ControlledPopoverWithTrigger, {
  ControlledPopoverWithTriggerProps,
} from "./ControlledPopoverWithTrigger";

export type TippyPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
} & Omit<ControlledPopoverWithTriggerProps, "visible" | "onClose" | "onOpen">;

export type TippyPopoverWithTriggerRef = {
  open: () => void;
  close: () => void;
};

const UncontrolledPopoverWithTrigger = forwardRef<
  TippyPopoverWithTriggerRef,
  TippyPopoverWithTriggerProps
>(function UncontrolledPopoverWithTrigger(
  { isInitiallyVisible, ...props },
  ref,
) {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const onOpen = useCallback(() => setVisible(true), []);
  const onClose = useCallback(() => setVisible(false), []);

  useImperativeHandle(ref, () => ({
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
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UncontrolledPopoverWithTrigger;
