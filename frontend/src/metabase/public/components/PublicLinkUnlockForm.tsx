import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { useUnlockPublicLinkMutation } from "metabase/api/public";
import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { Box, Button, Card, Stack, Text, TextInput } from "metabase/ui";
import { reload } from "metabase/utils/dom";

import S from "./PublicLinkUnlockForm.module.css";

interface PublicLinkUnlockFormProps {
  uuid: string;
  entityType: "card" | "dashboard";
}

function getUnlockErrorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error ?? t`Incorrect password.`;
}

export const PublicLinkUnlockForm = ({
  uuid,
  entityType,
}: PublicLinkUnlockFormProps) => {
  const [password, setPassword] = useState("");
  const [unlock, { isLoading, error }] = useUnlockPublicLinkMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      await unlock({ uuid, entityType, password }).unwrap();
      // A full reload lets the freshly-set unlock cookie through.
      reload();
    } catch {
      // The failure is surfaced to the user via the mutation's `error`.
    }
  };

  return (
    <div className={S.root}>
      <LighthouseIllustration />
      <div className={S.body}>
        <Box mb="lg">
          <LogoIcon height={65} />
        </Box>
        <Card className={S.card} p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <Text
                fw={700}
                size="lg"
                ta="center"
              >{t`This link is password protected`}</Text>
              <TextInput
                label={t`Password`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={t`Shhh...`}
                error={error ? getUnlockErrorMessage(error) : null}
                autoFocus
                data-testid="unlock-password-input"
              />
              <Button
                type="submit"
                variant="filled"
                loading={isLoading}
                disabled={!password}
                fullWidth
                data-testid="unlock-submit-button"
              >{t`Continue`}</Button>
            </Stack>
          </form>
        </Card>
      </div>
    </div>
  );
};
