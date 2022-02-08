import React from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";

interface PasswordButtonProps {
  redirectUrl?: string;
}

const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const link = redirectUrl
    ? `/auth/login/password?redirect=${encodeURIComponent(redirectUrl)}`
    : `/auth/login/password`;

  return <AuthButton link={link}>{t`Sign in with email`}</AuthButton>;
};

export default PasswordButton;
