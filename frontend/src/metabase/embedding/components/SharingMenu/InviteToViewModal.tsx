import { type ReactNode, useEffect, useState } from "react";
import { jt, t } from "ttag";

import {
  skipToken,
  useCreateUserMutation,
  useListInviteGroupIdsQuery,
  useListPermissionsGroupsQuery,
} from "metabase/api";
import { isEmailAlreadyInUse } from "metabase/api/utils/errors";
import {
  trackInviteToViewOpened,
  trackUserInvited,
} from "metabase/common/analytics";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";
import { UserForm } from "metabase/common/components/UserForm";
import { useSetting, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getSetting, isSsoEnabled } from "metabase/selectors/settings";
import {
  Button,
  Center,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import { generatePassword } from "metabase/utils/password";
import type { InviteTarget, User } from "metabase-types/api";

interface InviteToViewModalProps {
  title: string;
  shareUrl: string;
  triggeredFrom: "dashboard" | "question";
  inviteTarget?: InviteTarget;
  onClose: () => void;
}

export const InviteToViewModal = ({
  title,
  shareUrl,
  triggeredFrom,
  inviteTarget,
  onClose,
}: InviteToViewModalProps) => {
  const [createUser] = useCreateUserMutation();
  const [sendToast] = useToast();

  const isEmailConfigured = useSetting("email-configured?");
  const isPasswordLoginEnabled = useSelector((state) =>
    getSetting(state, "enable-password-login"),
  );
  const ssoEnabled = useSelector(isSsoEnabled);

  const [credentials, setCredentials] = useState<{
    email: string;
    tmpPassword: string;
  } | null>(null);

  const targetId = inviteTarget?.id ?? null;

  useEffect(() => {
    trackInviteToViewOpened({ triggeredFrom, targetId });
  }, [triggeredFrom, targetId]);

  // isLoading, not isFetching: a tag-invalidated background refetch must not unmount the form mid-typing.
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useListPermissionsGroupsQuery(
    inviteTarget ? { tenancy: "internal" } : skipToken,
  );

  // The access set changes whenever collection permissions do, so refetch on every open.
  const {
    data: accessGroupIds,
    isFetching: isFetchingAccessGroupIds,
    isError: isAccessGroupIdsError,
    refetch: refetchAccessGroupIds,
  } = useListInviteGroupIdsQuery(
    inviteTarget ? { type: inviteTarget.type, id: inviteTarget.id } : skipToken,
    { refetchOnMountOrArgChange: true },
  );

  const createInvitedUser = async (
    values: Partial<User>,
    password?: string,
  ) => {
    try {
      const user = await createUser({
        ...values,
        email: values.email ?? "",
        first_name: values.first_name ?? undefined,
        last_name: values.last_name ?? undefined,
        login_attributes: values.login_attributes || undefined,
        ...(password ? { password } : {}),
        ...(inviteTarget ? { invite_target: inviteTarget } : {}),
      }).unwrap();
      trackUserInvited({
        triggeredFrom,
        targetId,
        result: "success",
        eventDetail: "new_user",
      });
      return user;
    } catch (error) {
      trackUserInvited({
        triggeredFrom,
        targetId,
        result: "failure",
        eventDetail: isEmailAlreadyInUse(error) ? "existing_user" : null,
      });
      throw error;
    }
  };

  const inviteByEmail = async (values: Partial<User>) => {
    await createInvitedUser(values);
    sendToast({ icon: "check", message: t`Invitation sent` });
    onClose();
  };

  const inviteWithTemporaryPassword = async (values: Partial<User>) => {
    const tmpPassword = generatePassword();
    const user = await createInvitedUser(values, tmpPassword);
    setCredentials({ email: user.email, tmpPassword });
  };

  // Password login can only be off when SSO is configured, so this already implies SSO.
  const needsEmailSetup = !isEmailConfigured && !isPasswordLoginEnabled;

  let body: ReactNode;
  if (needsEmailSetup) {
    body = <EmailSetupPrompt shareUrl={shareUrl} onClose={onClose} />;
  } else if (credentials) {
    body = (
      <TemporaryPasswordSuccess
        email={credentials.email}
        password={credentials.tmpPassword}
        shareUrl={shareUrl}
        onClose={onClose}
      />
    );
  } else if (isLoadingGroups || isFetchingAccessGroupIds) {
    body = (
      <Center py="xl">
        <Loader />
      </Center>
    );
  } else if (isGroupsError || isAccessGroupIdsError) {
    // Without the access data the picker loses its "can view" safety net, so fail loudly instead.
    body = (
      <Stack gap="lg" align="center" py="xl">
        <Text>{t`Couldn't load groups. Please try again.`}</Text>
        <Button
          onClick={() => {
            refetchGroups();
            refetchAccessGroupIds();
          }}
        >
          {t`Try again`}
        </Button>
      </Stack>
    );
  } else {
    const accessCopy: Record<
      InviteTarget["type"],
      { sectionLabel: string; warningMessage: string }
    > = {
      dashboard: {
        sectionLabel: t`Can view this dashboard`,
        warningMessage: t`None of the selected groups can view this dashboard, so this person won't be able to see it.`,
      },
      question: {
        sectionLabel: t`Can view this question`,
        warningMessage: t`None of the selected groups can view this question, so this person won't be able to see it.`,
      },
    };
    body = (
      <UserForm
        initialValues={{}}
        groups={groups}
        groupAccess={
          inviteTarget &&
          accessGroupIds && {
            groupIds: accessGroupIds,
            ...accessCopy[inviteTarget.type],
          }
        }
        submitText={t`Send invitation`}
        onCancel={onClose}
        onSubmit={
          isEmailConfigured ? inviteByEmail : inviteWithTemporaryPassword
        }
        hideAttributes
        hideNameFields={ssoEnabled}
      />
    );
  }

  return (
    <Modal opened title={title} padding="xl" onClose={onClose}>
      {body}
    </Modal>
  );
};

const EmailSetupPrompt = ({
  shareUrl,
  onClose,
}: {
  shareUrl: string;
  onClose: () => void;
}) => (
  <Stack gap="lg">
    <Text>{t`To invite people by email, set up email first. Or share this link, they'll land on it after signing in:`}</Text>
    <CopyTextInput label={t`Link to share`} value={shareUrl} />
    <Group justify="flex-end">
      <Button onClick={onClose}>{t`Cancel`}</Button>
      <Button
        component={Link}
        to="/admin/settings/email"
        variant="filled"
        leftSection={<Icon name="mail" />}
      >
        {t`Set up email`}
      </Button>
    </Group>
  </Stack>
);

const TemporaryPasswordSuccess = ({
  email,
  password,
  shareUrl,
  onClose,
}: {
  email: string;
  password: string;
  shareUrl: string;
  onClose: () => void;
}) => (
  <Stack gap="lg">
    <Text>
      {jt`We couldn't send an email invitation. Share this temporary password with ${(
        <strong key="email">{email}</strong>
      )} so they can sign in.`}
    </Text>
    <PasswordReveal password={password} />
    <CopyTextInput label={t`Link to share`} value={shareUrl} />
    <Group justify="flex-end">
      <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
    </Group>
  </Stack>
);
