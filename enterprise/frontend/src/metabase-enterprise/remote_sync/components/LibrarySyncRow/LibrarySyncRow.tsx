import { useFormikContext } from "formik";
import { t } from "ttag";

import { Switch, Text } from "metabase/ui";

import { SYNC_LIBRARY_PENDING_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import { SyncListRow } from "../SyncList";

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
    <SyncListRow label={t`Library`} icon="repository">
      <Switch
        checked={isChecked}
        onChange={(e) => handleToggle(e.currentTarget.checked)}
        disabled={isReadOnly}
        aria-label={t`Sync Library`}
      />
      <Text>{t`Sync`}</Text>
    </SyncListRow>
  );
};
