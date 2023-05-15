import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import * as Urls from "metabase/lib/urls";
import {
  GoogleButtonRoot,
  AuthError,
  AuthErrorRoot,
  TextLink,
} from "./GoogleButton.styled";

export interface GoogleButtonProps {
  clientId: string | null;
  locale: string;
  redirectUrl?: string;
  isCard?: boolean;
  onLogin: (token: string, redirectUrl?: string) => void;
}

interface CredentialResponse {
  credential?: string;
}

const GoogleButton = ({
  clientId,
  locale,
  redirectUrl,
  isCard,
  onLogin,
}: GoogleButtonProps) => {
  const [errors, setErrors] = useState<string[]>([]);

  const handleLogin = useCallback(
    async ({ credential = "" }: CredentialResponse) => {
      try {
        setErrors([]);
        await onLogin(credential, redirectUrl);
      } catch (error) {
        setErrors(getErrors(error));
      }
    },
    [onLogin, redirectUrl],
  );

  const handleError = useCallback(() => {
    setErrors([
      t`There was an issue signing in with Google. Please contact an administrator.`,
    ]);
  }, []);

  return (
    <GoogleButtonRoot>
      {isCard && clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <GoogleLogin
            useOneTap
            onSuccess={handleLogin}
            onError={handleError}
            locale={locale}
            width="300"
          />
        </GoogleOAuthProvider>
      ) : (
        <TextLink to={Urls.login(redirectUrl)}>
          {t`Sign in with Google`}
        </TextLink>
      )}

      {errors.length > 0 && (
        <AuthErrorRoot>
          {errors.map((error, index) => (
            <AuthError key={index}>{error}</AuthError>
          ))}
        </AuthErrorRoot>
      )}
    </GoogleButtonRoot>
  );
};

const getErrors = (error: unknown): string[] => {
  const errors = getIn(error, ["data", "errors"]);
  return errors ? Object.values(errors) : [];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GoogleButton;
