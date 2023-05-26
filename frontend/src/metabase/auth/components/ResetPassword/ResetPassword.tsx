import React, { useCallback, useEffect, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { AuthLayout } from "../AuthLayout";
import {
  resetPassword,
  validatePassword,
  validatePasswordToken,
} from "../../actions";
import { ResetPasswordData } from "../../types";
import { ResetPasswordForm } from "../ResetPasswordForm";
import { InfoBody, InfoMessage, InfoTitle } from "./ResetPassword.styled";

type ViewType = "none" | "form" | "success" | "expired";

interface ResetPasswordQueryParams {
  token: string;
}

interface ResetPasswordProps {
  params: ResetPasswordQueryParams;
}

const ResetPassword = ({ params }: ResetPasswordProps): JSX.Element | null => {
  const { token } = params;
  const [view, setView] = useState<ViewType>("none");
  const dispatch = useDispatch();

  const handleLoad = useCallback(async () => {
    try {
      await validatePasswordToken(token);
      setView("form");
    } catch (error) {
      setView("expired");
    }
  }, [token]);

  const handlePasswordSubmit = useCallback(
    async ({ password }: ResetPasswordData) => {
      await dispatch(resetPassword({ token, password })).unwrap();
      dispatch(replace("/"));
      dispatch(addUndo({ message: t`You've updated your password.` }));
    },
    [token, dispatch],
  );

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ResetPassword;
