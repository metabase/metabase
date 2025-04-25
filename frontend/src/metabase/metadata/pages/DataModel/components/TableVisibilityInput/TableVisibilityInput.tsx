import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Card, Stack, Switch, Text } from "metabase/ui";

interface Props {
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const TableVisibilityInput = ({ checked, onChange }: Props) => (
  <Stack gap="sm">
    <Text fw="bold" size="sm">{t`Table visibility`}</Text>

    <Card bg="accent-gray-light" p="sm" radius="md" shadow="none">
      <Switch
        checked={checked}
        label={t`Hide this table`}
        size="sm"
        onChange={onChange}
      />
    </Card>
  </Stack>
);
