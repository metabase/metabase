import React, { forwardRef, ReactNode } from "react";
import { CardIcon, CardLink, CardText, TextLink } from "./AuthButton.styled";

export interface AuthButtonProps {
  link?: string;
  icon?: string;
  isCard?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

const AuthButton = (
  { link = "", icon, isCard, children, onClick }: AuthButtonProps,
  ref: any,
): JSX.Element => {
  return isCard ? (
    <CardLink innerRef={ref} to={link} onClick={onClick}>
      {icon && <CardIcon name={icon} />}
      <CardText>{children}</CardText>
    </CardLink>
  ) : (
    <TextLink innerRef={ref} to={link} onClick={onClick}>
      {children}
    </TextLink>
  );
};

export default forwardRef(AuthButton);
