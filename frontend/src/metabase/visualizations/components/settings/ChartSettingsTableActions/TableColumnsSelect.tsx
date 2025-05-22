import { t } from "ttag";

import { FormSelect } from "metabase/forms";
import type { DatasetColumn } from "metabase-types/api";

type TableColumnsSelectProps = {
  name: string;
  columns: DatasetColumn[];
};

export const TableColumnsSelect = ({
  name,
  columns,
}: TableColumnsSelectProps) => {
  const options = columns.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  return (
    <FormSelect
      label={t`Pick column`}
      name={name}
      data={options}
      shouldCastValueToNumber
    />
  );
};
