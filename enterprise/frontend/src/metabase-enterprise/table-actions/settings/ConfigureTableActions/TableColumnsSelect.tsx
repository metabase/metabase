import { useCallback } from "react";
import { t } from "ttag";

import { FormSelect } from "metabase/forms";

import type { BasicTableViewColumn } from "./types";

type TableColumnsSelectProps = {
  name: string;
  columns: BasicTableViewColumn[];
};

export const TableColumnsSelect = ({
  name,
  columns,
}: TableColumnsSelectProps) => {
  const options = columns.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  const validateValue = useCallback(
    (newValue: null | string | number) => {
      const isValidColumnRef = !!columns.find(({ id }) => id === newValue);

      if (!isValidColumnRef) {
        return t`Please pick a column to get data from`;
      }
    },
    [columns],
  );

  return (
    <FormSelect
      label={t`Pick column`}
      name={name}
      data={options}
      shouldCastValueToNumber
      validate={validateValue}
    />
  );
};
