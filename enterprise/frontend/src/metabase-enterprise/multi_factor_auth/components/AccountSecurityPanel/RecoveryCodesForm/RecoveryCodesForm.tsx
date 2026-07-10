import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { Button, Code, Group, Input, Stack, Text } from "metabase/ui";

type RecoveryCodesFormProps = {
  recoveryCodes: string[];
  message: string;
  onDone: () => void;
};

export function RecoveryCodesForm({
  recoveryCodes,
  message,
  onDone,
}: RecoveryCodesFormProps) {
  const codesText = recoveryCodes.join("\n");

  return (
    <Stack gap="md">
      <Text c="text-secondary">{message}</Text>
      <Input.Wrapper label={t`Your recovery codes`}>
        <Group mt="xs" align="flex-start" gap="sm" wrap="nowrap">
          <Code block flex={1}>
            {codesText}
          </Code>
          <CopyButton value={codesText} aria-label={t`Copy`} />
        </Group>
      </Input.Wrapper>
      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}
