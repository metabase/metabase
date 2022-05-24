import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import { TextLink } from "../AuthButton/AuthButton.styled";

import { AuthError, AuthErrorContainer } from "./GoogleButton.styled";
import { GoogleLogin } from "@react-oauth/google";
import MetabaseSettings from "metabase/lib/settings";

export interface GoogleButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
  onLogin: (token: string, redirectUrl?: string) => void;
}

const GoogleButton = ({ isCard, redirectUrl, onLogin }: GoogleButtonProps) => {
  const [errors, setErrors] = useState<string[]>([]);

  const siteLocale = MetabaseSettings.get("site-locale");

  const handleLogin = useCallback(
    async (response: string) => {
      try {
        setErrors([]);
        await onLogin(response, redirectUrl);
      } catch (error) {
        setErrors(getErrors(error));
      }
    },
    [onLogin, redirectUrl],
  );

  const handleError = useCallback((error: string) => {
    setErrors([error]);
  }, []);

  return (
    <div>
      {isCard ? (
        <GoogleLogin
          useOneTap
          onSuccess={({ credential }) => {
            handleLogin(credential ?? "");
          }}
          onError={() =>
            handleError(
              t`There was an issue signing in with Google. Please contact an administrator.`,
            )
          }
          locale={siteLocale}
          width="366"
        />
      ) : (
        <TextLink to={"#"} onClick={() => null}>
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
