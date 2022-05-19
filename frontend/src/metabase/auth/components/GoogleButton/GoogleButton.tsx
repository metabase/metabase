import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import AuthButton from "../AuthButton";
import { AuthError, AuthErrorContainer } from "./GoogleButton.styled";
import { GoogleLogin, useGoogleLogin } from "@react-oauth/google";
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
  const ref = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const siteLocale = MetabaseSettings.get("site-locale");

  const login = useGoogleLogin({
    onSuccess: async tokenResponse => {
      console.log("🚀", tokenResponse);
      // try {
      //   setErrors([]);
      //   await onLogin(tokenResponse.access_token, redirectUrl);
      // } catch (error) {
      //   setErrors(getErrors(error));
      // }
    },
    flow: "auth-code",
  });

  const handleLogin = useCallback(
    async (response: string) => {
      console.log("🚀", response);
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
      <AuthButton onClick={() => login()} icon="google" isCard={isCard}>
        {t`Sign in with Google`}
      </AuthButton>

      <GoogleLogin
        onSuccess={({ credential }) => {
          handleLogin(credential ?? "");
        }}
        onError={(error: any) => setErrors([error])}
        locale={siteLocale}
        width="386"
      />

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
