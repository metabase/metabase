import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import { loginGoogle } from "../../actions";
import {
  GoogleButtonRoot,
  AuthError,
  AuthErrorRoot,
  TextLink,
} from "./GoogleButton.styled";

interface GoogleButtonProps {
  redirectUrl?: string;
  isCard?: boolean;
}

interface CredentialResponse {
  credential?: string;
}

export const GoogleButton = ({ redirectUrl, isCard }: GoogleButtonProps) => {
  const clientId = useSelector(state =>
    getSetting(state, "google-auth-client-id"),
  );
  const locale = useSelector(state => getSetting(state, "site-locale"));
  const [errors, setErrors] = useState<string[]>([]);
  const dispatch = useDispatch();

  const handleLogin = useCallback(
    async ({ credential = "" }: CredentialResponse) => {
      try {
        setErrors([]);
        await dispatch(loginGoogle({ credential, redirectUrl })).unwrap();
      } catch (error) {
        setErrors(getErrors(error));
      }
    },
    [dispatch, redirectUrl],
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
