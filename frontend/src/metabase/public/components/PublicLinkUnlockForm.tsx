import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { LighthouseIllustration } from "metabase/common/components/LighthouseIllustration";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { PublicApi } from "metabase/services";
import { Box, Button, Card, Stack, Text, TextInput } from "metabase/ui";

import S from "./PublicLinkUnlockForm.module.css";

interface PublicLinkUnlockFormProps {
  uuid: string;
  entityType: "card" | "dashboard";
}

export const PublicLinkUnlockForm = ({
  uuid,
  entityType,
}: PublicLinkUnlockFormProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await PublicApi.unlock({ uuid, entityType, password });
      window.location.reload();
    } catch (err: any) {
      setError(err?.data?.error ?? t`Incorrect password.`);
      setIsLoading(false);
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
                error={error}
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
