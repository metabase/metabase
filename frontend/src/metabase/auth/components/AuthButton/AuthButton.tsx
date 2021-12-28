import React from "react";
import { TextRoot, TextLink } from "./AuthButton.styled";

export interface AuthButtonProps {
  icon?: string;
  text?: string;
}

const AuthButton = ({ text }: AuthButtonProps): JSX.Element => {
  return (
    <TextRoot>
      <TextLink to="">{text}</TextLink>
    </TextRoot>
  );
};

export default AuthButton;
