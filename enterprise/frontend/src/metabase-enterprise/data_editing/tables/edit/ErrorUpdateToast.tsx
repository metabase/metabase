import { useState } from "react";
import { t } from "ttag";

import type { GenericErrorResponse } from "metabase/lib/errors";
import { Button, Group, Icon, Text } from "metabase/ui";

type ErrorUpdateToastProps = {
  error: unknown;
};

export const ErrorUpdateToast = ({ error }: ErrorUpdateToastProps) => {
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage =
    // @ts-expect-error - generic errors are not fully typed
    (error as GenericErrorResponse).data.errors?.[0]?.error ??
    // @ts-expect-error - generic errors are not fully typed
    (error as GenericErrorResponse).errors?.[0]?.error ??
    t`Unknown error`;

  if (showDetails) {
    return (
      <Text c="text-white">
        {t`Couldn't save table changes:`}
        <br />
        {errorMessage}
      </Text>
    );
  }

  return (
    <Group gap="2.5rem">
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
