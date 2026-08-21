import cx from "classnames";
import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Group,
  Icon,
  Notification,
  Portal,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./Toaster.module.css";

// `color` is omitted because the native HTML attribute's `string` type
// conflicts with Mantine's `NotificationProps["color"]` union.
export interface ToastProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "color"
> {
  message: string;
  confirmText?: string;
  confirmAriaLabel?: string;
  closeAriaLabel?: string;
  show: boolean;
  fixed?: boolean;
  canClose?: boolean;
  secondaryText?: string;
  secondaryAriaLabel?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onSecondary?: () => void;
  "data-testid"?: string;
}

export const Toast = ({
  message,
  confirmText = t`Turn on`,
  confirmAriaLabel = t`Confirm`,
  closeAriaLabel = t`Close`,
  show,
  fixed,
  canClose = true,
  secondaryText,
  secondaryAriaLabel = t`Cancel`,
  leftSection,
  rightSection,
  onConfirm,
  onDismiss,
  onSecondary,
  className,
  "data-testid": dataTestId = "toast",
  ...divProps
}: ToastProps): JSX.Element => {
  const hasActions = Boolean(
    onConfirm || (secondaryText && onSecondary) || rightSection,
  );

  return (
    <Notification
      className={cx(S.toast, className)}
      classNames={{
        icon: S.icon,
        body: S.body,
        closeButton: S.dismiss,
      }}
      data-testid={dataTestId}
      data-show={show ? true : undefined}
      data-fixed={fixed ? true : undefined}
      data-has-actions={hasActions ? true : undefined}
      icon={leftSection}
      withBorder={false}
      withCloseButton={canClose}
      onClose={onDismiss}
      closeButtonProps={{
        "aria-label": closeAriaLabel,
        icon: <Icon name="close" size={12} />,
      }}
      {...divProps}
    >
      <Group gap="lg" align="center" wrap="nowrap">
        <Text className={S.message} flex={1} c="tooltip-text" fz="md">
          {message}
        </Text>
        {hasActions && (
          <Group gap="sm" align="center" wrap="nowrap">
            {onConfirm && (
              <UnstyledButton
                className={cx(S.button, S.primary)}
                onClick={onConfirm}
                aria-label={confirmAriaLabel}
              >
                {confirmText}
              </UnstyledButton>
            )}
            {secondaryText && onSecondary && (
              <UnstyledButton
                className={cx(S.button, S.secondary)}
                onClick={onSecondary}
                aria-label={secondaryAriaLabel}
              >
                {secondaryText}
              </UnstyledButton>
            )}
            {rightSection}
          </Group>
        )}
      </Group>
    </Notification>
  );
};

export interface ToasterProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  confirmText?: string;
  isShown: boolean;
  fixed?: boolean;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const Toaster = ({
  message,
  confirmText = t`Turn on`,
  isShown,
  fixed,
  leftSection,
  rightSection,
  onConfirm,
  onDismiss,
  className,
  ...divProps
}: ToasterProps): JSX.Element | null => {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);

  useEffect(() => {
    if (isShown) {
      setRender(true);
      setTimeout(() => {
        setOpen(true);
      }, 100);
    } else {
      setOpen(false);
      setTimeout(() => {
        setRender(false);
      }, 300);
    }
  }, [isShown]);

  return render ? (
    <Portal>
      <Toast
        message={message}
        confirmText={confirmText}
        show={open}
        fixed={fixed}
        leftSection={leftSection}
        rightSection={rightSection}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        className={className}
        {...divProps}
      />
    </Portal>
  ) : null;
};
