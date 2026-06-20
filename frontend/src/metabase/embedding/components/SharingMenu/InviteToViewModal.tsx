import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";

import { UserForm } from "metabase/admin/people/forms/UserForm";
import { useCreateUserMutation } from "metabase/api";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";
import { useSetting, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getSetting, isSsoEnabled } from "metabase/selectors/settings";
import { Button, Group, Icon, Modal, Stack, Text } from "metabase/ui";
import { generatePassword } from "metabase/utils/password";
import type { User } from "metabase-types/api";

interface InviteToViewModalProps {
  title: string;
  onClose: () => void;
}

export const InviteToViewModal = ({
  title,
  onClose,
}: InviteToViewModalProps) => {
  const [createUser] = useCreateUserMutation();
  const [sendToast] = useToast();

  const isEmailConfigured = useSetting("email-configured?");
  const hasSso = useSelector(isSsoEnabled);
  const isPasswordLoginEnabled = useSelector((state) =>
    getSetting(state, "enable-password-login"),
  );
  // Password login can only be turned off once SSO is configured,
  // so this is the "recipient can't use a temporary password" case.
  const isSsoOnly = hasSso && !isPasswordLoginEnabled;

  const [tempPassword, setTempPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const createInvitedUser = (values: Partial<User>, password?: string) =>
    createUser({
      ...values,
      email: values.email ?? "",
      first_name: values.first_name ?? undefined,
      last_name: values.last_name ?? undefined,
      login_attributes: values.login_attributes || undefined,
      ...(password ? { password } : {}),
    }).unwrap();

  const inviteByEmail = async (values: Partial<User>) => {
    await createInvitedUser(values);
    sendToast({ icon: "check", message: t`Invitation sent` });
    onClose();
  };

  const inviteWithTemporaryPassword = async (values: Partial<User>) => {
    const password = generatePassword();
    const user = await createInvitedUser(values, password);
    setTempPassword({ email: user.email, password });
  };

  const needsEmailSetup = !isEmailConfigured && isSsoOnly;

  let body: ReactNode;
  if (needsEmailSetup) {
    body = <EmailSetupPrompt onClose={onClose} />;
  } else if (tempPassword) {
    body = (
      <TemporaryPasswordSuccess
        email={tempPassword.email}
        password={tempPassword.password}
        onClose={onClose}
      />
    );
  } else {
    body = (
      <UserForm
        initialValues={{}}
        submitText={t`Send invitation`}
        onCancel={onClose}
        onSubmit={
          isEmailConfigured ? inviteByEmail : inviteWithTemporaryPassword
        }
        hideAttributes
        hideNameFields={hasSso}
      />
    );
  }

  return (
    <Modal opened title={title} padding="xl" onClose={onClose}>
      {body}
    </Modal>
  );
};

const EmailSetupPrompt = ({ onClose }: { onClose: () => void }) => (
  <Stack gap="lg">
    <Text>{t`To invite people by email, set up email first.`}</Text>
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
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) => (
  <Stack gap="lg">
    <Text>
      {jt`We couldn't send an email invite, so share this password with ${(
        <strong key="email">{email}</strong>
      )} so they can sign in:`}
    </Text>
    <PasswordReveal password={password} />
    <Group justify="flex-end">
      <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
    </Group>
  </Stack>
);
