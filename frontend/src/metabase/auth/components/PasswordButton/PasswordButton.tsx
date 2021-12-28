import React from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";

const PasswordButton = () => {
  return (
    <AuthButton link="/auth/login/password">{t`Sign in with email`}</AuthButton>
  );
};

export default PasswordButton;
