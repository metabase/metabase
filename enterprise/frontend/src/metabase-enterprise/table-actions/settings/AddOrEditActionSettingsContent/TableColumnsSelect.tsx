import { useField } from "formik";
import { type FocusEvent, useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { Select } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";

type TableColumnsSelectProps = {
  name: string;
  columns: BasicTableViewColumn[];
};

export const TableColumnsSelect = ({
  name,
  columns,
}: TableColumnsSelectProps) => {
  const options = columns.map(({ name, display_name }) => ({
    value: name,
    label: display_name,
  }));

  const validate = useCallback(
    (value: null | string) => {
      const isValidColumnRef = !!columns.find(({ name }) => name === value);

      if (!isValidColumnRef) {
        return t`Please pick a column to get data from`;
      }
    },
    [columns],
  );

  const [{ value }, { error, touched }, { setValue, setTouched }] = useField({
    name,
    validate,
  });

  useMount(() => {
    if (value && validate(value)) {
      setTouched(true);
    }
  });

  const handleChange = useCallback(
    (newValue: string | null) => {
      if (newValue === null) {
        setValue(undefined);
      } else {
        setValue(newValue);
      }
    },
    [setValue],
  );

  const handleBlur = useCallback(
    (_event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
    },
    [setTouched],
  );

  return (
    <Select
      label={t`Pick column`}
      name={name}
      data={options}
      value={value ?? null}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};
