import { t } from "ttag";

import { FormSelect } from "metabase/forms";
import type { Field } from "metabase-types/api";

type TableColumnsSelectProps = {
  name: string;
  columns: Field[];
};

export const TableColumnsSelect = ({
  name,
  columns,
}: TableColumnsSelectProps) => {
  const options = columns.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  return <FormSelect label={t`Pick column`} name={name} data={options} />;
};
