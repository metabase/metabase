import { useState } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Stack, Text } from "metabase/ui";

import { getUpdateApiErrorMessage } from "./getUpdateErrorMessage";

type ErrorUpdateToastProps = {
  error: unknown;
};

export const ErrorUpdateToast = ({ error }: ErrorUpdateToastProps) => {
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage = getUpdateApiErrorMessage(error);

  if (showDetails) {
    return (
      <Stack gap="0.5rem" w="30rem" maw="100%">
        <Text c="text-white">{t`Couldn't save table changes:`}</Text>
        <Text c="text-white" style={{ fontFamily: "monospace" }}>
          {errorMessage}
        </Text>
      </Stack>
    );
  }

  return (
    <Group gap="2.5rem" w="20rem">
      <Group gap="0.5rem">
        <Icon name="warning" c="danger" size={12} />
        <Text c="text-white" fw={700}>{t`Couldn't save table changes`}</Text>
      </Group>

      <Button
        size="compact-lg"
        color="var(--mb-base-color-orion-80)"
        variant="filled"
        autoContrast
        radius="0.5rem"
        onClick={() => setShowDetails(true)}
      >{t`More info`}</Button>
    </Group>
  );
};
