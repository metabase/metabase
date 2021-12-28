import React from "react";
import { t } from "ttag";
import AuthLayout from "../../containers/AuthLayout";
import { AuthProvider } from "../../types";
import {
  LoginList,
  LoginListItem,
  LoginPanel,
  LoginTitle,
} from "./Login.styled";

export interface LoginProps {
  providers: AuthProvider[];
  providerName?: string;
  redirectUrl?: string;
}

const Login = ({
  providers,
  providerName,
  redirectUrl,
}: LoginProps): JSX.Element => {
  const provider = getSelectedProvider(providers, providerName);

  return (
    <AuthLayout>
      <LoginTitle>{t`Sign in to Metabase`}</LoginTitle>
      {provider && provider.Panel && (
        <LoginPanel>
          <provider.Panel />
        </LoginPanel>
      )}
      {!provider && (
        <LoginList>
          {providers.map(provider => (
            <LoginListItem key={provider.name}>
              <provider.Button large={true} redirectUrl={redirectUrl} />
            </LoginListItem>
          ))}
        </LoginList>
      )}
    </AuthLayout>
  );
};

const getSelectedProvider = (
  providers: AuthProvider[],
  providerName?: string,
): AuthProvider | undefined => {
  const provider =
    providers.length > 1
      ? providers.find(p => p.name === providerName)
      : providers[0];

  return provider?.Panel ? provider : undefined;
};

export default Login;
