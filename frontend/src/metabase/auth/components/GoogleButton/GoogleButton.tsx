import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import AuthButton from "../AuthButton";
import { TextLink } from "../AuthButton/AuthButton.styled";

import { AuthError, AuthErrorContainer } from "./GoogleButton.styled";
import { GoogleLogin } from "@react-oauth/google";
import MetabaseSettings from "metabase/lib/settings";

export type AttachCallback = (
  element: HTMLElement,
  onLogin: (token: string) => void,
  onError: (error: string) => void,
) => void;

export interface GoogleButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
  onAttach: AttachCallback;
  onLogin: (token: string, redirectUrl?: string) => void;
}

const GoogleButton = ({
  isCard,
  redirectUrl,
  onAttach,
  onLogin,
}: GoogleButtonProps) => {
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
          onSuccess={({ credential }) => {
            handleLogin(credential ?? "");
          }}
          onError={() =>
            handleError(t`Google Sign In has errored. Please try again.`)
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
