import React from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";

export interface GoogleButtonProps {
  large?: boolean;
}

const GoogleButton = ({ large }: GoogleButtonProps) => {
  return (
    <AuthButton text={t`Sign in with Google`} icon="google" card={large} />
  );
};

export default GoogleButton;
