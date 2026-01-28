import { useFormikContext } from "formik";
import { t } from "ttag";

import { Box, Flex, Icon, Switch, Text } from "metabase/ui";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import { TRANSFORMS_KEY } from "../../constants";

interface TransformsSyncRowProps {
  isLast: boolean;
  isReadOnly: boolean;
}

export const TransformsSyncRow = ({
  isLast,
  isReadOnly,
}: TransformsSyncRowProps) => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncConfigurationSettings>();
  const isChecked = values[TRANSFORMS_KEY] ?? false;

  const handleToggle = (checked: boolean) => {
    setFieldValue(TRANSFORMS_KEY, checked);
  };

  return (
    <Box
      p="md"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--mb-color-border)",
      }}
    >
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Icon name="transform" c="text-secondary" />
          <Text fw="medium">{t`Transforms`}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Switch
            size="sm"
            checked={isChecked}
            onChange={(e) => handleToggle(e.currentTarget.checked)}
            disabled={isReadOnly}
            aria-label={t`Sync Transforms`}
          />
          <Text>{t`Sync`}</Text>
        </Flex>
      </Flex>
    </Box>
  );
};
