import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

import { AlertIcon, AlertRoot } from "./Alert.styled";

export type AlertVariant = "info" | "warning" | "error";

interface AlertProps {
  children: ReactNode;
  icon?: IconName;
  hasBorder?: boolean;
  className?: string;
  variant?: AlertVariant;
}

const Alert = ({
  children,
  hasBorder = true,
  icon,
  variant = "info",
  className,
}: AlertProps) => {
  return (
    <AlertRoot hasBorder={hasBorder} className={className} variant={variant}>
      {icon && <AlertIcon variant={variant} name={icon} size={24} />}
      <div>{children}</div>
    </AlertRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Alert;
