import { t } from "ttag";

import { FormSelect } from "metabase/forms";

type TableColumnsSelectProps = {
  name: string;
  columns: { id: number; name: string }[];
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
