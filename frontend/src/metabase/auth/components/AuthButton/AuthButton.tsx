import React, { ReactNode } from "react";
import { CardIcon, CardLink, CardText, TextLink } from "./AuthButton.styled";

interface AuthButtonProps {
  link?: string;
  icon?: string;
  isCard?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export const AuthButton = ({
  link = "",
  icon,
  isCard,
  children,
  onClick,
}: AuthButtonProps): JSX.Element => {
  return isCard ? (
    <CardLink to={link} onClick={onClick}>
      {icon && <CardIcon name={icon} />}
      <CardText>{children}</CardText>
    </CardLink>
  ) : (
    <TextLink to={link} onClick={onClick}>
      {children}
    </TextLink>
  );
};
