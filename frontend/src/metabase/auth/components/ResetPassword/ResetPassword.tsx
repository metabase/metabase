import { useCallback } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { useGetPasswordResetTokenStatusQuery } from "metabase/api";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { PasswordResetTokenStatus } from "metabase-types/api";

import { resetPassword, validatePassword } from "../../actions";
import type { ResetPasswordData } from "../../types";
import { AuthLayout } from "../AuthLayout";
import { ResetPasswordForm } from "../ResetPasswordForm";

import { InfoBody, InfoMessage, InfoTitle } from "./ResetPassword.styled";

type ViewType = "none" | "form" | "expired";

interface ResetPasswordQueryParams {
  token: string;
}

interface ResetPasswordProps {
  params: ResetPasswordQueryParams;
}

export const ResetPassword = ({
  params,
}: ResetPasswordProps): JSX.Element | null => {
  const { token } = params;
  const dispatch = useDispatch();
  const { data: status, error } = useGetPasswordResetTokenStatusQuery(token);
  const view = getViewType(status, error);

  const handlePasswordSubmit = useCallback(
    async ({ password }: ResetPasswordData) => {
      await dispatch(resetPassword({ token, password })).unwrap();
      dispatch(replace("/"));
      dispatch(addUndo({ message: t`You've updated your password.` }));
    },
    [token, dispatch],
  );

  return (
    <AuthLayout>
      {view === "form" && (
        <ResetPasswordForm
          onValidatePassword={validatePassword}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {view === "expired" && <ResetPasswordExpired />}
    </AuthLayout>
  );
};

const ResetPasswordExpired = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoTitle>{t`Whoops, that's an expired link`}</InfoTitle>
      <InfoMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </InfoMessage>
      <Button as={Link} primary to={"/auth/forgot_password"}>
        {t`Request a new reset email`}
      </Button>
    </InfoBody>
  );
};

function getViewType(
  status?: PasswordResetTokenStatus,
  error?: unknown,
): ViewType {
  if (!status && !error) {
    return "none";
  } else {
    return status?.valid ? "form" : "expired";
  }
}
