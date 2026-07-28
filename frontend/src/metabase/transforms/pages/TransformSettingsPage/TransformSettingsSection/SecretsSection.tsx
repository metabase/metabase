import { useState } from "react";
import { t } from "ttag";

import { useUpdateTransformMutation } from "metabase/api";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  ActionIcon,
  Button,
  Code,
  Divider,
  Group,
  Icon,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { Transform } from "metabase-types/api";

const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;
const MAX_SECRET_NAME_LENGTH = 64;

function isValidSecretName(name: string) {
  return SECRET_NAME_REGEX.test(name) && name.length <= MAX_SECRET_NAME_LENGTH;
}

type SecretsSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

export function SecretsSection({ transform, readOnly }: SecretsSectionProps) {
  const secretKeys = transform.secret_keys ?? [];

  return (
    <TitleSection
      label={t`Secrets`}
      description={t`Secrets are exposed to this transform's Python code as environment variables. Values can't be viewed after saving.`}
      data-testid="transform-secrets-section"
    >
      {secretKeys.length > 0 ? (
        <Stack gap={0}>
          {secretKeys.map((name) => (
            <SecretRow
              key={name}
              transform={transform}
              name={name}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      ) : (
        <Group p="lg">
          <Text c="text-secondary">{t`No secrets configured yet.`}</Text>
        </Group>
      )}
      {!readOnly && (
        <>
          <Divider />
          <AddSecretForm transform={transform} secretKeys={secretKeys} />
        </>
      )}
    </TitleSection>
  );
}

type SecretRowProps = {
  transform: Transform;
  name: string;
  readOnly?: boolean;
};

function SecretRow({ transform, name, readOnly }: SecretRowProps) {
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleRemove = async () => {
    const { error } = await updateTransform({
      id: transform.id,
      secrets: { [name]: null },
    });
    if (error) {
      sendErrorToast(t`Failed to remove secret ${name}`);
    } else {
      sendSuccessToast(t`Secret ${name} removed`);
    }
  };

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="lg"
      py="md"
      data-testid="transform-secret-row"
    >
      <Group gap="sm" wrap="nowrap">
        <Code fz="md">{name}</Code>
        <Text c="text-secondary" fz="sm">{t`Value hidden`}</Text>
      </Group>
      {!readOnly && (
        <ActionIcon
          aria-label={t`Remove secret ${name}`}
          disabled={isLoading}
          onClick={handleRemove}
        >
          <Icon name="trash" />
        </ActionIcon>
      )}
    </Group>
  );
}

type AddSecretFormProps = {
  transform: Transform;
  secretKeys: string[];
};

function AddSecretForm({ transform, secretKeys }: AddSecretFormProps) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const trimmedName = name.trim();
  const isNameValid = isValidSecretName(trimmedName);
  const nameError =
    trimmedName.length > 0 && !isNameValid
      ? t`Use uppercase letters, digits, and underscores, starting with a letter (max ${MAX_SECRET_NAME_LENGTH} characters).`
      : undefined;
  const isReplacing = secretKeys.includes(trimmedName);
  const canSave = isNameValid && value.length > 0 && !isLoading;

  const handleSave = async () => {
    const { error } = await updateTransform({
      id: transform.id,
      secrets: { [trimmedName]: value },
    });
    if (error) {
      sendErrorToast(t`Failed to save secret ${trimmedName}`);
    } else {
      sendSuccessToast(t`Secret ${trimmedName} saved`);
      setName("");
      setValue("");
    }
  };

  return (
    <Stack p="lg" gap="md">
      <Group align="flex-start" wrap="nowrap">
        <TextInput
          label={t`Name`}
          placeholder="MY_API_TOKEN"
          value={name}
          error={nameError}
          maw="16rem"
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <PasswordInput
          label={t`Value`}
          placeholder={t`Secret value`}
          value={value}
          flex={1}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <Button
          mt="1.5rem"
          disabled={!canSave}
          loading={isLoading}
          onClick={handleSave}
        >
          {isReplacing ? t`Replace secret` : t`Add secret`}
        </Button>
      </Group>
      <Text c="text-secondary" fz="sm">
        {t`Your Python code can read each secret with os.environ, using its name.`}
      </Text>
    </Stack>
  );
}
