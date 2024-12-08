import cx from "classnames";
import { type ReactNode, useCallback, useState } from "react";
import _ from "underscore";

import { Button, Popover } from "metabase/ui";

interface ControlledPopoverWithTriggerProps {
  renderTrigger?: (args: {
    visible: boolean;
    onClick: () => void;
    closePopover: () => void;
  }) => ReactNode;
  triggerContent?: ReactNode;
  popoverContent:
    | ReactNode
    | ((args: { closePopover: () => void }) => ReactNode);
  visible: boolean;
  triggerClasses?: string;
  triggerStyle?: React.CSSProperties;
  triggerClassesOpen?: string;
  triggerClassesClose?: string;
  onOpen: () => void;
  onClose: () => void;
  disabled: boolean;
}

export const ControlledPopoverWithTrigger = ({
  triggerClasses,
  triggerStyle,
  triggerClassesOpen,
  triggerClassesClose,
  renderTrigger,
  triggerContent,
  popoverContent,
  visible,
  disabled,
  onOpen,
  onClose,
}: ControlledPopoverWithTriggerProps) => {
  const handleTriggerClick = () => {
    if (!disabled) {
      onOpen();
    }
  };

  const computedTarget = renderTrigger ? (
    renderTrigger({
      visible,
      onClick: handleTriggerClick,
      closePopover: onClose,
    })
  ) : (
    <Button
      className={cx(
        triggerClasses,
        visible && triggerClassesOpen,
        !visible && triggerClassesClose,
      )}
      disabled={disabled}
      aria-disabled={disabled}
      style={triggerStyle}
      onClick={handleTriggerClick}
    >
      {triggerContent}
    </Button>
  );

  const computedPopoverContent = _.isFunction(popoverContent)
    ? popoverContent({ closePopover: onClose })
    : popoverContent;

  return (
    <Popover opened={visible}>
      <Popover.Target>{computedTarget}</Popover.Target>
      <Popover.Dropdown>{computedPopoverContent}</Popover.Dropdown>
    </Popover>
  );
};

type UncontrolledPopoverWithTriggerProps = {
  isInitiallyVisible?: boolean;
} & Omit<ControlledPopoverWithTriggerProps, "visible">;

export const UncontrolledPopoverWithTrigger = ({
  isInitiallyVisible,
  onClose,
  ...rest
}: UncontrolledPopoverWithTriggerProps) => {
  const [visible, setVisible] = useState(isInitiallyVisible || false);

  const handleOpen = useCallback(() => setVisible(true), []);
  const handleClose = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  return (
    <ControlledPopoverWithTrigger
      {...rest}
      visible={visible}
      onOpen={handleOpen}
      onClose={handleClose}
    />
  );
};
