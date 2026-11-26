import { useFormikContext } from "formik";
import type { ChangeEvent, JSX, ReactNode } from "react";
import { useCallback } from "react";

import { FormSwitch } from "metabase/forms";
import type { DatabaseData } from "metabase-types/api";

import { SCAN_ONLY_USED_FIELD_VALUES_SETTING } from "../../utils/settings";

export interface DatabaseScheduleToggleFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
}

const DatabaseScheduleToggleField = ({
  name,
  title,
  description,
}: DatabaseScheduleToggleFieldProps): JSX.Element => {
  const { values, setFieldValue } = useFormikContext<DatabaseData>();
  const { settings } = values;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFieldValue("is_full_sync", !event.target.checked);
      setFieldValue("is_on_demand", false);
      // The toggle resets the scan mode, and the picker for it is hidden when the toggle is off.
      const isScanOnlyUsed =
        settings?.[SCAN_ONLY_USED_FIELD_VALUES_SETTING] === true;
      if (isScanOnlyUsed) {
        setFieldValue("settings", {
          ...settings,
          [SCAN_ONLY_USED_FIELD_VALUES_SETTING]: false,
        });
      }
    },
    [setFieldValue, settings],
  );

  return (
    <FormSwitch
      name={name}
      label={title}
      description={description}
      onChange={handleChange}
      mb="lg"
      labelPosition="left"
      styles={{
        body: {
          justifyContent: "space-between",
        },
        label: {
          fontWeight: "bold",
          fontSize: "var(--mantine-font-size-md)",
        },
      }}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseScheduleToggleField;
