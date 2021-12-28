import React from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";

export interface GoogleButtonProps {
  card?: boolean;
}

const GoogleButton = ({ card }: GoogleButtonProps) => {
  return <AuthButton text={t`Sign in with Google`} icon="google" card={card} />;
};

export default GoogleButton;
