import { useFormikContext } from "formik";
import { t } from "ttag";

import CS from "metabase/css/core/bordered.module.css";
import { Box, Flex, Icon, Switch, Text } from "metabase/ui";

import { SYNC_LIBRARY_PENDING_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";

export const LibrarySyncRow = () => {
  const { values } = useFormikContext<RemoteSyncSettingsFormState>();
  const isChecked = values[SYNC_LIBRARY_PENDING_KEY] ?? false;

  return (
    <Box p="lg" className={CS.borderRowDivider}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Icon name="repository" c="text-secondary" />
          <Text fw="medium">{t`Library`}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            checked={isChecked}
            readOnly
            disabled
            aria-label={t`Sync Library`}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
