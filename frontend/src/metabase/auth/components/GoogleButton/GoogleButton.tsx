import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import AuthButton from "../AuthButton";
import { AuthError } from "./GoogleButton.styled";

export type AttachCallback = (
  element: HTMLElement,
  onLogin: (token: string) => void,
  onError: (error: string) => void,
) => void;

export interface GoogleButtonProps {
  isCard?: boolean;
  onAttach: AttachCallback;
  onLogin: (token: string) => void;
}

const GoogleButton = ({ isCard, onAttach, onLogin }: GoogleButtonProps) => {
  const ref = useRef<HTMLAnchorElement>();
  const [errors, setErrors] = useState<string[]>([]);

  const handleLogin = useCallback(
    async (token: string) => {
      try {
        setErrors([]);
        await onLogin(token);
      } catch (error) {
        setErrors(getErrors(error));
      }
    },
    [onLogin],
  );

  const handleError = useCallback((error: string) => {
    setErrors([error]);
  }, []);

  useEffect(() => {
    ref.current && onAttach(ref.current, handleLogin, handleError);
  }, [onAttach, handleLogin]);

  return (
    <div>
      <AuthButton ref={ref} icon="google" isCard={isCard}>
        {t`Sign in with Google`}
      </AuthButton>
      {errors.length > 0 && (
        <AuthError>
          {errors.map((error, index) => (
            <div key={index}>{error}</div>
          ))}
        </AuthError>
      )}
    </div>
  );
};

const getErrors = (error: unknown): string[] => {
  const errors = getIn(error, ["data", "errors"]);
  return errors ? Object.values(errors) : [];
};

export default GoogleButton;
