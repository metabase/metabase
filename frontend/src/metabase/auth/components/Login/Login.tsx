import React from "react";
import { t } from "ttag";
import AuthLayout from "../../containers/AuthLayout";
import { AuthProvider } from "../../types";
import { LoginList, LoginListItem, LoginTitle } from "./Login.styled";

export interface LoginProps {
  providers: AuthProvider[];
  redirectUrl?: string;
}

const Login = ({ providers, redirectUrl }: LoginProps): JSX.Element => {
  return (
    <AuthLayout>
      <LoginTitle>{t`Sign in to Metabase`}</LoginTitle>
      <LoginList>
        {providers.map(provider => (
          <LoginListItem key={provider.name}>
            <provider.Button card redirectUrl={redirectUrl} />
          </LoginListItem>
        ))}
      </LoginList>
    </AuthLayout>
  );
};

export default Login;
