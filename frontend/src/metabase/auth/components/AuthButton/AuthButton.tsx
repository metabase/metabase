import React, { ReactNode } from "react";
import {
  CardIcon,
  CardLink,
  CardText,
  TextLink,
  TextRoot,
} from "./AuthButton.styled";

export interface AuthButtonProps {
  link?: string;
  icon?: string;
  card?: boolean;
  children: ReactNode;
  onClick?: () => void;
}

const AuthButton = ({
  link = "",
  icon,
  card,
  children,
  onClick,
}: AuthButtonProps): JSX.Element => {
  return card ? (
    <CardLink to={link} onClick={onClick}>
      {icon && <CardIcon name={icon} />}
      <CardText>{children}</CardText>
    </CardLink>
  ) : (
    <TextRoot>
      <TextLink to={link} onClick={onClick}>
        {children}
      </TextLink>
    </TextRoot>
  );
};

export default AuthButton;
