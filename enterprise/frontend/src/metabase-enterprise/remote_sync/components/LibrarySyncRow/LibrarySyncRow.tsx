import { useFormikContext } from "formik";
import { t } from "ttag";

import CS from "metabase/css/core/bordered.module.css";
import { Box, Flex, Icon, Switch, Text } from "metabase/ui";

import { SYNC_LIBRARY_PENDING_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";

interface LibrarySyncRowProps {
  isReadOnly: boolean;
}

export const LibrarySyncRow = ({ isReadOnly }: LibrarySyncRowProps) => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncSettingsFormState>();
  const isChecked = values[SYNC_LIBRARY_PENDING_KEY] ?? false;

  const handleToggle = (checked: boolean) => {
    setFieldValue(SYNC_LIBRARY_PENDING_KEY, checked);
  };

  return (
    <Box p="lg" className={CS.borderRowDivider}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Icon name="repository" c="text-secondary" />
          <Text fw="medium">{t`Library`}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            size="sm"
            checked={isChecked}
            onChange={(e) => handleToggle(e.currentTarget.checked)}
            disabled={isReadOnly}
            aria-label={t`Sync Library`}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
