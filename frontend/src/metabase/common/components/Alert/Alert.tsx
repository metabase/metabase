import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

import { AlertIcon, AlertRoot, CloseIcon } from "./Alert.styled";

export type AlertVariant = "info" | "warning" | "error";

export interface AlertProps {
  children: ReactNode;
  icon?: IconName;
  hasBorder?: boolean;
  className?: string;
  variant?: AlertVariant;
  onClose?: () => void;
}
/** @deprecated - use metabase/ui alert instead **/
export const Alert = ({
  children,
  hasBorder = true,
  icon,
  variant = "info",
  onClose,
  className,
}: AlertProps) => {
  return (
    <AlertRoot
      hasBorder={hasBorder}
      className={className}
      variant={variant}
      role="alert"
    >
      {icon && <AlertIcon variant={variant} name={icon} size={24} />}

      <div>{children}</div>

      {onClose && (
        <CloseIcon
          variant="info"
          name="close"
          size={24}
          onClick={onClose}
          data-testid="alert-close-button"
        />
      )}
    </AlertRoot>
  );
};
