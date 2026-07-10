import { useCallback, useState } from "react";
import { t } from "ttag";

import type { MfaChallengeResponse } from "metabase/api/session";
import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import type { LoginData } from "metabase/redux/auth";
import { login } from "metabase/redux/auth";

import {
  getExternalAuthProviders,
  getHasSessionCookies,
  getIsLdapEnabled,
} from "../../selectors";
import { AuthButton } from "../AuthButton";
import { LoginForm } from "../LoginForm";

import { ActionList, ActionListItem } from "./PasswordPanel.styled";

interface PasswordPanelProps {
  redirectUrl?: string;
}

export const PasswordPanel = ({ redirectUrl }: PasswordPanelProps) => {
  const providers = useSelector(getExternalAuthProviders);
  const isLdapEnabled = useSelector(getIsLdapEnabled);
  const hasSessionCookies = useSelector(getHasSessionCookies);
  const dispatch = useDispatch();

  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeResponse | null>(
    null,
  );

  const handleSubmit = useCallback(
    async (data: LoginData) => {
      const { mfaChallenge: challenge } = await dispatch(
        login({ data, redirectUrl }),
      ).unwrap();
      if (challenge) {
        setMfaChallenge(challenge);
      }
    },
    [dispatch, redirectUrl],
  );

  if (mfaChallenge) {
    return (
      <PLUGIN_MULTI_FACTOR_AUTH.ChallengeForm
        mfaToken={mfaChallenge.mfa_token}
        methods={mfaChallenge.methods}
        onCancel={() => setMfaChallenge(null)}
      />
    );
  }

  return (
    <div>
      <LoginForm
        isLdapEnabled={isLdapEnabled}
        hasSessionCookies={hasSessionCookies}
        onSubmit={handleSubmit}
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
