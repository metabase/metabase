import { ReactNode } from "react";
import { IconName } from "../Icon";
import { AlertIcon, AlertRoot } from "./Alert.styled";

export type AlertVariant = "info" | "error";

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
