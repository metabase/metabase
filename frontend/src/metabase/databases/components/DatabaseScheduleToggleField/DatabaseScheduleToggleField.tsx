import { useFormikContext } from "formik";
import type { ChangeEvent, ReactNode } from "react";
import { useCallback } from "react";

import { FormSwitch } from "metabase/forms";
import type { DatabaseData } from "metabase-types/api";

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
  const { setFieldValue } = useFormikContext<DatabaseData>();

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFieldValue("is_full_sync", !event.target.checked);
      setFieldValue("is_on_demand", false);
    },
    [setFieldValue],
  );

  return (
    <FormSwitch
      name={name}
      label={title}
      description={description}
      onChange={handleChange}
      mb="md"
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
