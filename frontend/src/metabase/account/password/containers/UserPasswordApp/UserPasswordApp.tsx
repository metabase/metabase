import { t } from "ttag";

import { getIsSsoUser } from "metabase/account/selectors";
import { hasAuthenticationSettings } from "metabase/account/utils";
import { Api, useDisconnectSlackMutation } from "metabase/api";
import { getErrorStatus } from "metabase/api/client/errors";
import { getErrorMessage } from "metabase/api/utils";
import { useValidatePassword } from "metabase/common/hooks";
import { useToast } from "metabase/common/hooks/use-toast";
import { useGetCurrentUserQuery } from "metabase/current-user";
import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Stack } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";

import { SlackAccount } from "../../components/SlackAccount/SlackAccount";
import { UserPasswordForm } from "../../components/UserPasswordForm";

const UserPasswordApp = () => {
  const { data, refetch, isFetching } = useGetCurrentUserQuery();
  const user = checkNotNull(data);
  const isSsoUser = useSelector(getIsSsoUser);
  const validatePassword = useValidatePassword();
  const [disconnectSlack, { isLoading }] = useDisconnectSlackMutation();
  const [sendToast] = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const mfaEnforcement = useSetting("mfa-enforcement");

  const handleDisconnect = async () => {
    const result = await disconnectSlack(user.id);
    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: getErrorMessage(
          result.error,
          t`Couldn't disconnect your Slack account.`,
        ),
      });
      return;
    }

    const currentUser = await refetch();
    if (currentUser.error && getErrorStatus(currentUser.error) !== 401) {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`Couldn't refresh your account settings. Please reload the page.`,
      });
      return;
    }

    sendToast({ message: t`Your Slack account has been disconnected.` });
    if (getErrorStatus(currentUser.error) === 401) {
      dispatch(Api.util.resetApiState());
      navigate("/auth/login");
    } else if (
      currentUser.data &&
      !hasAuthenticationSettings(currentUser.data, mfaEnforcement)
    ) {
      navigate("/account/profile", { replace: true });
    }
  };

  return (
    <Stack gap="xxl">
      {!isSsoUser && (
        <Stack gap="lg">
          <UserPasswordForm user={user} onValidatePassword={validatePassword} />
        </Stack>
      )}
      <PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel />
      {user.slack_account_status != null && (
        <SlackAccount
          isActive={user.slack_account_status === "active"}
          isDisconnecting={isLoading || isFetching}
          onDisconnect={handleDisconnect}
        />
      )}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserPasswordApp;
