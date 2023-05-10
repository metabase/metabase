import React, { ReactNode } from "react";
import { CardIcon, CardLink, CardText, TextLink } from "./AuthButton.styled";

export interface AuthButtonProps {
  link?: string;
  icon?: string;
  isCard?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

const AuthButton = ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AuthButton;
