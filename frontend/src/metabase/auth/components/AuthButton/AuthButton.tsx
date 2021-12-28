import React from "react";
import { TextRoot, TextLink } from "./AuthButton.styled";

export interface AuthButtonProps {
  icon?: string;
  text?: string;
  href?: string;
}

const AuthButton = ({ text, href = "" }: AuthButtonProps): JSX.Element => {
  return (
    <TextRoot>
      <TextLink to={href}>{text}</TextLink>
    </TextRoot>
  );
};

export default AuthButton;
