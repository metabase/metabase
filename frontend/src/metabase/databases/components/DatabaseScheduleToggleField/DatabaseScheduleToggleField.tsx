import React, { ReactNode, useCallback } from "react";
import { useFormikContext } from "formik";
import FormToggle from "metabase/core/components/FormToggle";
import { DatabaseData } from "metabase-types/api";

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
    (value: boolean) => {
      setFieldValue("is_full_sync", !value);
      setFieldValue("is_on_demand", false);
    },
    [setFieldValue],
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseScheduleToggleField;
