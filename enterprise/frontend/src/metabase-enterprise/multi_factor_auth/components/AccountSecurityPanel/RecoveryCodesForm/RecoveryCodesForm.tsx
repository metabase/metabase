import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Button, Group, Input, Stack, Text } from "metabase/ui";

import { CopyableCodeBlock } from "../CopyableCodeBlock";

type RecoveryCodesFormProps = {
  recoveryCodes: string[];
  message: ReactNode;
  onDone: () => void;
};

export function RecoveryCodesForm({
  recoveryCodes,
  message,
  onDone,
}: RecoveryCodesFormProps) {
  return (
    <Stack gap="md">
      <Text c="text-secondary">{message}</Text>
      <Input.Wrapper label={t`Your recovery codes`}>
        <Box mt="xs">
          <CopyableCodeBlock codes={recoveryCodes} />
        </Box>
      </Input.Wrapper>
      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}
