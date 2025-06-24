import type { RefObject } from "react";
import { useCallback, useImperativeHandle, useState } from "react";

import type { ControlledPopoverWithTriggerProps } from "./ControlledPopoverWithTrigger";
import ControlledPopoverWithTrigger from "./ControlledPopoverWithTrigger";

export type TippyPopoverWithTriggerRef = {
  open: () => void;
  close: () => void;
};

export type TippyPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
  popoverRef?: RefObject<TippyPopoverWithTriggerRef>;
  onClose?: () => void;
} & Omit<ControlledPopoverWithTriggerProps, "visible" | "onClose" | "onOpen">;

/**
 * @deprecated prefer Popover from "metabase/ui" instead
 */
function UncontrolledPopoverWithTrigger({
  isInitiallyVisible,
  popoverRef,
  onClose,
  ...props
}: TippyPopoverWithTriggerProps) {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const handleOpen = useCallback(() => setVisible(true), []);
  const handleClose = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  useImperativeHandle(popoverRef, () => ({
    open: handleOpen,
    close: handleClose,
  }));

  return (
    <ControlledPopoverWithTrigger
      {...props}
      visible={visible}
      onOpen={handleOpen}
      onClose={handleClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UncontrolledPopoverWithTrigger;
