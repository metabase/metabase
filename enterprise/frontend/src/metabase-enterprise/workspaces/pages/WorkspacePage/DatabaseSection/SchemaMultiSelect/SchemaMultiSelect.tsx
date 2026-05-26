import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { Checkbox, Input, ScrollArea, Stack, Text } from "metabase/ui";
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

  const isAll = schemas.length > 0 && value.length === schemas.length;
  const isNone = value.length === 0;

  const handleToggleAll = () => {
    onChange(isAll ? [] : schemas);
  };

  return (
    <Input.Wrapper label={t`Schemas to include`}>
      {schemas.length > 0 && (
        <Stack gap="sm" mt="xs">
          <Checkbox
            variant="stacked"
            label={
              <Text c="text-secondary" lh="inherit">
                {isAll ? t`Select none` : t`Select all`}
              </Text>
            }
            checked={isAll}
            indeterminate={!isAll && !isNone}
            onChange={handleToggleAll}
          />
          <Checkbox.Group value={value} onChange={onChange}>
            <ScrollArea.Autosize mah={200}>
              <Stack gap="sm">
                {schemas.map((schema) => (
                  <Checkbox key={schema} value={schema} label={schema} />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Checkbox.Group>
        </Stack>
      )}
    </Input.Wrapper>
  );
}
