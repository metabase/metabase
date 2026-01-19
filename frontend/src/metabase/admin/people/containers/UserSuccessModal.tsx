import cx from "classnames";
import { useEffect } from "react";
import type { WithRouterProps } from "react-router";
import { push, replace } from "react-router-redux";
import { jt, t } from "ttag";

import { useGetUserQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import Link from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import PasswordReveal from "metabase/common/components/PasswordReveal";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getSetting, isSsoEnabled } from "metabase/selectors/settings";
import { Box } from "metabase/ui";
import type { User } from "metabase-types/api";

import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

interface UserSuccessModalProps extends WithRouterProps {
  params: { userId: string };
}

export function UserSuccessModal({ params }: UserSuccessModalProps) {
  const userId = parseInt(params.userId);
  const { data: user, isLoading, error } = useGetUserQuery(userId);

  const isExternalUser = PLUGIN_TENANTS.isExternalUser(user);

  const temporaryPassword = useSelector((state) =>
    getUserTemporaryPassword(state, { userId }),
  );
  const hasSsoEnabled = useSelector(isSsoEnabled);
  const hasPasswordLoginEnabled = useSelector((state) =>
    getSetting(state, "enable-password-login"),
  );
  const dispatch = useDispatch();

  const handleClose = () => {
    dispatch(
      isExternalUser
        ? push("/admin/people/tenants/people")
        : push("/admin/people"),
    );
  };

  useEffect(() => {
    return () => {
      dispatch(clearTemporaryPassword(userId));
    };
  }, [userId, dispatch]);

  useEffect(() => {
    if (isExternalUser && !temporaryPassword) {
      dispatch(replace("/admin/people/tenants/people"));
    }
  }, [isExternalUser, temporaryPassword, dispatch]);

  if (!user || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ConfirmModal
      opened
      title={t`${user.common_name} has been added`}
      padding="xl"
      onClose={handleClose}
      onConfirm={handleClose}
      closeButtonText={null}
      confirmButtonProps={{ color: "brand" }}
      confirmButtonText={t`Done`}
      message={
        temporaryPassword ? (
          <PasswordSuccess user={user} temporaryPassword={temporaryPassword} />
        ) : (
          <EmailSuccess
            isSsoEnabled={hasSsoEnabled && !hasPasswordLoginEnabled}
            user={user}
          />
        )
      }
    />
  );
}

const EmailSuccess = ({
  user,
  isSsoEnabled,
}: {
  user: User;
  isSsoEnabled: boolean;
}) => {
  if (isSsoEnabled) {
    return (
      <div>{jt`We’ve sent an invite to ${(
        <strong key="email">{user.email}</strong>
      )} with instructions to log in. If this user is unable to authenticate then you can ${(
        <Link
          key="link"
          to={`/admin/people/${user.id}/reset`}
          className={CS.link}
        >{t`reset their password.`}</Link>
      )}`}</div>
    );
  }
  return (
    <div>{jt`We’ve sent an invite to ${(
      <strong key="email">{user.email}</strong>
    )} with instructions to set their password.`}</div>
  );
};

const PasswordSuccess = ({
  user,
  temporaryPassword,
}: {
  user: User;
  temporaryPassword: string;
}) => (
  <div>
    <Box pb="4rem">
      {jt`We couldn’t send them an email invitation, so make sure to tell them to log in using ${(
        <strong key="email">{user.email}</strong>
      )} and this password we’ve generated for them:`}
    </Box>

    <PasswordReveal password={temporaryPassword} />
    <Box ta="center" p="2rem 4.5rem 0">
      {jt`If you want to be able to send email invites, just go to the ${(
        <Link
          key="link"
          to="/admin/settings/email"
          className={cx(CS.link, CS.textBold)}
        >
          {t`Email settings`}
        </Link>
      )} page.`}
    </Box>
  </div>
);
