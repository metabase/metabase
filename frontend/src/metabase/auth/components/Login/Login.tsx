import React from "react";
import { t } from "ttag";
import { AuthLayout } from "../AuthLayout";
import { AuthProvider } from "../../types";
import {
  ActionList,
  ActionListItem,
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
  const selection = getSelectedProvider(providers, providerName);

  return (
    <AuthLayout>
      <LoginTitle>{t`Sign in to Metabase`}</LoginTitle>
      {selection && selection.Panel && (
        <LoginPanel>
          <selection.Panel redirectUrl={redirectUrl} />
        </LoginPanel>
      )}
      {!selection && (
        <ActionList>
          {providers.map(provider => (
            <ActionListItem key={provider.name}>
              <provider.Button isCard={true} redirectUrl={redirectUrl} />
            </ActionListItem>
          ))}
        </ActionList>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Login;
