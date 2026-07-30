import { t } from "ttag";

import { SecretNameInput } from "metabase/transforms/components/SecretNameInput";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  PasswordInput,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import type { NewTransformSecret } from "./form";

const SECRET_NAME_WIDTH = "12rem";

type SecretsFieldsProps = {
  secrets: NewTransformSecret[];
  onChange: (secrets: NewTransformSecret[]) => void;
};

export function SecretsFields({ secrets, onChange }: SecretsFieldsProps) {
  const handleAdd = () => {
    onChange([...secrets, { name: "", value: "" }]);
  };

  const handleRemove = (index: number) => {
    onChange(secrets.filter((_, secretIndex) => secretIndex !== index));
  };

  const handleChange = (index: number, secret: NewTransformSecret) => {
    onChange(
      secrets.map((prevSecret, secretIndex) =>
        secretIndex === index ? secret : prevSecret,
      ),
    );
  };

  return (
    <Stack gap="sm" data-testid="transform-secrets-fields">
      <Group gap="xs">
        <Text fw="bold">{t`Secrets`}</Text>
        <Tooltip
          label={t`Secrets are passed to your Python code in the secrets argument, keyed by name. Values can't be viewed after saving.`}
        >
          <Icon name="info" c="text-secondary" size={14} />
        </Tooltip>
      </Group>
      {secrets.map((secret, index) => (
        <Group key={index} gap="sm" wrap="nowrap" align="flex-start">
          <SecretNameInput
            label={undefined}
            aria-label={t`Secret name`}
            w={SECRET_NAME_WIDTH}
            value={secret.name}
            onChange={(name) => handleChange(index, { ...secret, name })}
          />
          <PasswordInput
            aria-label={t`Secret value`}
            placeholder={t`Value`}
            flex={1}
            value={secret.value}
            onChange={(event) =>
              handleChange(index, {
                ...secret,
                value: event.currentTarget.value,
              })
            }
          />
          <ActionIcon
            aria-label={t`Remove secret`}
            mt="xs"
            onClick={() => handleRemove(index)}
          >
            <Icon name="trash" />
          </ActionIcon>
        </Group>
      ))}
      <Box>
        <Button
          variant="subtle"
          size="compact-md"
          p={0}
          leftSection={<Icon name="add" size={12} />}
          onClick={handleAdd}
        >
          {t`Add secret`}
        </Button>
      </Box>
    </Stack>
  );
}
