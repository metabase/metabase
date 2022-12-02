import React, { ReactNode, useCallback } from "react";
import { useFormikContext } from "formik";
import FormToggle from "metabase/core/components/FormToggle";
import { DatabaseValues } from "../../types";

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
  const { setValues } = useFormikContext<DatabaseValues>();

  const handleChange = useCallback(
    (value: boolean) => {
      if (!value) {
        setValues(values => ({
          ...values,
          schedules: {},
          is_full_sync: true,
          is_on_demand: false,
        }));
      }
    },
    [setValues],
  );

  return (
    <FormToggle
      name={name}
      title={title}
      description={description}
      onChange={handleChange}
    />
  );
};

export default DatabaseScheduleToggleField;
