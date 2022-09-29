import React, { useCallback, useState } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { t } from "ttag";
import { getIn } from "icepick";
import * as Urls from "metabase/lib/urls";
import { AuthError, AuthErrorContainer, TextLink } from "./GoogleButton.styled";

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
    <div>
      {isCard && clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <GoogleLogin
            useOneTap
            onSuccess={handleLogin}
            onError={handleError}
            locale={locale}
            width="366"
          />
        </GoogleOAuthProvider>
      ) : (
        <TextLink to={Urls.login(redirectUrl)}>
          {t`Sign in with Google`}
        </TextLink>
      )}

      {errors.length > 0 && (
        <AuthErrorContainer>
          {errors.map((error, index) => (
            <AuthError key={index}>{error}</AuthError>
          ))}
        </AuthErrorContainer>
      )}
    </div>
  );
};

const getErrors = (error: unknown): string[] => {
  const errors = getIn(error, ["data", "errors"]);
  return errors ? Object.values(errors) : [];
};

export default GoogleButton;
