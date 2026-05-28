import { useId } from "react";
import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { Button, Group, Input, MultiSelect, Stack } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

// to not cover the add database button
const DROPDOWN_WIDTH = 432;

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
  const inputId = useId();

  const isAll = schemas.length > 0 && value.length === schemas.length;

  const handleToggleAll = () => {
    onChange(isAll ? [] : schemas);
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Input.Label htmlFor={inputId}>{t`Schemas to include`}</Input.Label>
        {schemas.length > 0 && (
          <Button variant="subtle" size="compact-xs" onClick={handleToggleAll}>
            {isAll ? t`Select none` : t`Select all`}
          </Button>
        )}
      </Group>
      <MultiSelect
        id={inputId}
        data={schemas.map((schema) => ({ value: schema, label: schema }))}
        value={value}
        placeholder={isAll ? t`All schemas selected` : t`Select schemas`}
        comboboxProps={{ width: DROPDOWN_WIDTH, position: "bottom-start" }}
        onChange={onChange}
      />
    </Stack>
  );
}
