import { useCallback, useState } from "react";
import { t } from "ttag";

import type {
  MfaChallengeResponse,
  MfaEnrollmentResponse,
} from "metabase/api/session";
import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { login } from "metabase/redux/auth";
import { useSetting } from "metabase/settings";
import type { LoginData } from "metabase-types/api";

import { getExternalAuthProviders } from "../../selectors";
import { AuthTextLink } from "../AuthButton";
import { LoginForm } from "../LoginForm";

import { ActionList, ActionListItem } from "./PasswordPanel.styled";

interface PasswordPanelProps {
  redirectUrl?: string;
}

export const PasswordPanel = ({ redirectUrl }: PasswordPanelProps) => {
  const providers = useSelector(getExternalAuthProviders);
  const isLdapEnabled = useSetting("ldap-enabled");
  const hasSessionCookies = useSetting("session-cookies");
  const dispatch = useDispatch();

  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeResponse | null>(
    null,
  );
  const [mfaEnrollment, setMfaEnrollment] =
    useState<MfaEnrollmentResponse | null>(null);
  const [remember, setRemember] = useState(false);

  const handleSubmit = useCallback(
    async (data: LoginData) => {
      const { mfaChallenge: challenge, mfaEnrollment: enrollment } =
        await dispatch(login({ data, redirectUrl })).unwrap();

      if (challenge) {
        setRemember(Boolean(data.remember));
        setMfaChallenge(challenge);
      } else if (enrollment) {
        setRemember(Boolean(data.remember));
        setMfaEnrollment(enrollment);
      }
    },
    [dispatch, redirectUrl],
  );

  if (mfaChallenge) {
    return (
      <PLUGIN_MULTI_FACTOR_AUTH.AuthChallengeForm
        challengeToken={mfaChallenge.challenge_token}
        methods={mfaChallenge.methods}
        remember={remember}
        onCancel={() => setMfaChallenge(null)}
      />
    );
  }

  if (mfaEnrollment) {
    return (
      <PLUGIN_MULTI_FACTOR_AUTH.AuthEnrollmentForm
        enrollmentToken={mfaEnrollment.enrollment_token}
        secret={mfaEnrollment.secret}
        otpauthUri={mfaEnrollment.otpauth_uri}
        remember={remember}
        onCancel={() => setMfaEnrollment(null)}
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
          <AuthTextLink to="/auth/forgot_password">
            {t`I seem to have forgotten my password`}
          </AuthTextLink>
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
