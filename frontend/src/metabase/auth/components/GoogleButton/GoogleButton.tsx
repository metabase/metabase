import React from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";

export interface GoogleButtonProps {
  large?: boolean;
}

const GoogleButton = ({ large }: GoogleButtonProps) => {
  return (
    <AuthButton icon="google" card={large}>
      {t`Sign in with Google`}
    </AuthButton>
  );
};

export default GoogleButton;
