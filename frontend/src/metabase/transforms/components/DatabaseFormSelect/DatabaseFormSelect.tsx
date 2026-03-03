import { useMemo } from "react";

import { FormField, FormSelect, type FormSelectProps } from "metabase/forms";
import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import type { Database } from "metabase-types/api";

type DatabaseFormSelectProps = Omit<FormSelectProps, "data"> & {
  databases: Database[];
};

export function DatabaseFormSelect({
  databases,
  ...rest
}: DatabaseFormSelectProps) {
  const data = useMemo(
    () =>
      databases
        .filter(doesDatabaseSupportTransforms)
        .map((db) => ({ value: String(db.id), label: db.name })),
    [databases],
  );

  return (
    <FormField mb={0}>
      <FormSelect {...rest} data={data} />
    </FormField>
  );
}
