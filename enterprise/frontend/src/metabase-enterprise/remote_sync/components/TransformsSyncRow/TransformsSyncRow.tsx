import { useFormikContext } from "formik";
import { t } from "ttag";

import CS from "metabase/css/core/bordered.module.css";
import { Box, Flex, Icon, Switch, Text } from "metabase/ui";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import { TRANSFORMS_KEY } from "../../constants";

export const TransformsSyncRow = () => {
  const { values } = useFormikContext<RemoteSyncConfigurationSettings>();
  const isChecked = values[TRANSFORMS_KEY] ?? false;

  return (
    <Box p="lg" className={CS.borderRowDivider}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Icon name="transform" c="text-secondary" />
          <Text fw="medium">{t`Transforms`}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            checked={isChecked}
            readOnly
            disabled
            aria-label={t`Sync Transforms`}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
