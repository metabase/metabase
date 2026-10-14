import type { ReactNode } from "react";
import { t } from "ttag";

import { FormFooter } from "metabase/common/components/FormFooter";
import { Box, Button, Input, Stack, Text, useIsInModal } from "metabase/ui";

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
  const isInModal = useIsInModal();

  return (
    <>
      <Stack gap={isInModal ? "xl" : "lg"}>
        <Text c="text-secondary">{message}</Text>
        <Input.Wrapper label={t`Your recovery codes`}>
          <Box mt="xxs">
            <CopyableCodeBlock codes={recoveryCodes} />
          </Box>
        </Input.Wrapper>
      </Stack>
      <FormFooter pageProps={{ mt: "lg" }}>
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </FormFooter>
    </>
  );
}
