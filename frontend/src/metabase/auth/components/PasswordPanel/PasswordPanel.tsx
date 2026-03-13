import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";

import { login, mfaVerify } from "../../actions";
import {
  getExternalAuthProviders,
  getHasSessionCookies,
  getIsLdapEnabled,
} from "../../selectors";
import type { LoginData, MfaVerifyData } from "../../types";
import { AuthButton } from "../AuthButton";
import { LoginForm } from "../LoginForm";
import { MfaForm } from "../MfaForm";

import { ActionList, ActionListItem } from "./PasswordPanel.styled";

interface PasswordPanelProps {
  redirectUrl?: string;
}

export const PasswordPanel = ({ redirectUrl }: PasswordPanelProps) => {
  const providers = useSelector(getExternalAuthProviders);
  const isLdapEnabled = useSelector(getIsLdapEnabled);
  const hasSessionCookies = useSelector(getHasSessionCookies);
  const dispatch = useDispatch();
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const handleLoginSubmit = useCallback(
    async (data: LoginData) => {
      const result = await dispatch(login({ data, redirectUrl })).unwrap();
      if (result?.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
      }
    },
    [dispatch, redirectUrl],
  );

  const handleMfaSubmit = useCallback(
    async (data: MfaVerifyData) => {
      await dispatch(mfaVerify(data)).unwrap();
    },
    [dispatch],
  );

  const handleMfaCancel = useCallback(() => {
    setMfaToken(null);
  }, []);

  if (mfaToken) {
    return (
      <MfaForm
        mfaToken={mfaToken}
        onSubmit={handleMfaSubmit}
        onCancel={handleMfaCancel}
      />
    );
  }

  return (
    <div>
      <LoginForm
        isLdapEnabled={isLdapEnabled}
        hasSessionCookies={hasSessionCookies}
        onSubmit={handleLoginSubmit}
      />
      <ActionList>
        <ActionListItem>
          <AuthButton link="/auth/forgot_password">
            {t`I seem to have forgotten my password`}
          </AuthButton>
        </ActionListItem>
        {providers.map((provider) => (
          <ActionListItem key={provider.name}>
            <provider.Button redirectUrl={redirectUrl} />
          </ActionListItem>
        ))}
      </ActionList>
    </div>
  );
};
