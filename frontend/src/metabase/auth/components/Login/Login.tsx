import React from "react";
import { t } from "ttag";
import { Location } from "history";
import { useSelector } from "metabase/lib/redux";
import { AuthLayout } from "../AuthLayout";
import { getAuthProviders } from "../../selectors";
import { AuthProvider } from "../../types";
import {
  ActionList,
  ActionListItem,
  LoginPanel,
  LoginTitle,
} from "./Login.styled";

interface LoginQueryString {
  redirect?: string;
}

interface LoginQueryParams {
  provider?: string;
}

interface LoginProps {
  params?: LoginQueryParams;
  location?: Location<LoginQueryString>;
}

export const Login = ({ params, location }: LoginProps): JSX.Element => {
  const providers = useSelector(getAuthProviders);
  const selection = getSelectedProvider(providers, params?.provider);
  const redirectUrl = location?.query?.redirect;

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
