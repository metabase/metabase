import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { MultiSelect } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

export type SchemaMultiSelectProps = {
  databaseId: DatabaseId;
  value: string[];
  onChange: (schemas: string[]) => void;
};

export function SchemaMultiSelect({
  databaseId,
  value,
  onChange,
}: SchemaMultiSelectProps) {
  const { data: schemas = [] } = useListDatabaseSchemasQuery({
    id: databaseId,
  });
  const isAllSelected = schemas.length > 0 && value.length === schemas.length;

  return (
    <MultiSelect
      label={t`Schemas to include`}
      description={t`The value of providing a value cannot be overstated.`}
      placeholder={isAllSelected ? t`All schemas selected` : t`Pick schemas`}
      data={schemas}
      value={value}
      onChange={onChange}
    />
  );
}
