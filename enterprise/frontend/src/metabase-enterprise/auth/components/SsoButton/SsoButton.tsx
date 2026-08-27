import { useCallback, useEffect } from "react";
import { t } from "ttag";

import {
  AuthCardButton,
  AuthTextButton,
} from "metabase/auth/components/AuthButton";
import { useDispatch } from "metabase/redux";
import { isWithinIframe } from "metabase/utils/iframe";

import { loginSSO } from "../../actions";

interface SsoButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
}

export const SsoButton = ({
  isCard,
  redirectUrl,
}: SsoButtonProps): JSX.Element => {
  const isEmbedded = isWithinIframe();
  const dispatch = useDispatch();

  const handleLogin = useCallback(() => {
    dispatch(loginSSO(redirectUrl));
  }, [dispatch, redirectUrl]);

  useEffect(() => {
    if (isEmbedded) {
      handleLogin();
    }
  }, [isEmbedded, handleLogin]);

  const Button = isCard ? AuthCardButton : AuthTextButton;
  return <Button onClick={handleLogin}>{t`Sign in with SSO`}</Button>;
};
