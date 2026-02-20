import { useCallback } from "react";
import { t } from "ttag";

import { useGetPasswordResetTokenStatusQuery } from "metabase/api";
import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch } from "metabase/lib/redux";
import {
  useLocationWithQuery,
  useNavigation,
  useRouteParams,
} from "metabase/routing/compat";

import { resetPassword, validatePassword } from "../../actions";
import type { ResetPasswordData } from "../../types";
import { AuthLayout } from "../AuthLayout";
import { ResetPasswordForm } from "../ResetPasswordForm";

import { InfoBody, InfoMessage, InfoTitle } from "./ResetPassword.styled";

type ResetPasswordQueryParams = {
  token?: string;
  email?: string;
  [key: string]: string | undefined;
};

export const ResetPassword = (): JSX.Element | null => {
  const params = useRouteParams<ResetPasswordQueryParams>();
  const location = useLocationWithQuery();
  const { replace } = useNavigation();
  const token = params.token ?? "";
  const redirectUrl = location.query?.redirect;
  const email = location.query?.email;
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const { data: status, isLoading } =
    useGetPasswordResetTokenStatusQuery(token);

  const handlePasswordSubmit = useCallback(
    async ({ password }: ResetPasswordData) => {
      await dispatch(resetPassword({ token, password })).unwrap();
      replace(redirectUrl || "/");
      sendToast({ message: t`You've updated your password.` });
    },
    [token, dispatch, redirectUrl, sendToast, replace],
  );

  if (isLoading) {
    return <AuthLayout />;
  }

  return (
    <AuthLayout>
      {status?.valid ? (
        <ResetPasswordForm
          onValidatePassword={validatePassword}
          onSubmit={handlePasswordSubmit}
        />
      ) : (
        <ResetPasswordExpired email={email} />
      )}
    </AuthLayout>
  );
};

interface ResetPasswordExpiredProps {
  email?: string;
}

const ResetPasswordExpired = ({
  email,
}: ResetPasswordExpiredProps): JSX.Element => {
  const forgotPasswordUrl = email
    ? `/auth/forgot_password?email=${encodeURIComponent(email)}`
    : "/auth/forgot_password";

  return (
    <InfoBody>
      <InfoTitle>{t`Whoops, that's an expired link`}</InfoTitle>
      <InfoMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </InfoMessage>
      <Button as={Link} primary to={forgotPasswordUrl}>
        {t`Request a new reset email`}
      </Button>
    </InfoBody>
  );
};
