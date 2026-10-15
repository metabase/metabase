import { useFormikContext } from "formik";
import { t } from "ttag";

import { Switch, Text } from "metabase/ui";
import type { RemoteSyncConfigurationSettings } from "metabase-types/api";

import { TRANSFORMS_KEY } from "../../constants";
import { SyncListRow } from "../SyncList";

interface TransformsSyncRowProps {
  isReadOnly: boolean;
}

export const TransformsSyncRow = ({ isReadOnly }: TransformsSyncRowProps) => {
  const { values, setFieldValue } =
    useFormikContext<RemoteSyncConfigurationSettings>();
  const isChecked = values[TRANSFORMS_KEY] ?? false;

  const handleToggle = (checked: boolean) => {
    setFieldValue(TRANSFORMS_KEY, checked);
  };

  return (
    <SyncListRow label={t`Transforms`} icon="transform">
      <Switch
        checked={isChecked}
        onChange={(e) => handleToggle(e.currentTarget.checked)}
        disabled={isReadOnly}
        aria-label={t`Sync Transforms`}
      />
      <Text>{t`Sync`}</Text>
    </SyncListRow>
  );
};
