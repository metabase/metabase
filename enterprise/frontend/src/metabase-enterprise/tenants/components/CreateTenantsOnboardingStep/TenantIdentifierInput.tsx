import { c, jt, t } from "ttag";

import { Autocomplete, Stack, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { useFieldDistinctValues } from "./hooks/use-field-distinct-values";
import { getIsolationFieldConfig } from "./isolation-field-config";

export const TenantIdentifierInput = ({
  value,
  onChange,
  selectedFieldIds,
  columnName,
}: {
  value: string;
  onChange: (value: string) => void;
  selectedFieldIds?: FieldId[];
  columnName?: string | null;
}) => {
  // Fetch value from first field only.
  // We expect all tables to share the same multi-tenancy column,
  // and they should share the same tenant_id values.
  const firstFieldId = selectedFieldIds?.[0];

  const { values: suggestions } = useFieldDistinctValues(firstFieldId);

  const config = getIsolationFieldConfig("row-column-level-security")!;

  const placeholder = suggestions[0]
    ? c("example tenant identifier value from the database")
        .t`e.g. ${suggestions[0]}`
    : c("example tenant identifier value").t`e.g. acme-corp`;

  const description = columnName
    ? jt`Enter a value that matches the ${<strong key="col">{columnName}</strong>} column.`
    : config.description;

  return (
    <Stack gap="xs">
      <Text fw="bold" size="sm">
        {config.label}
      </Text>

      <Text c="text-secondary" size="xs" mb="sm">
        {description}
      </Text>

      <Autocomplete
        value={value}
        onChange={onChange}
        data={suggestions}
        placeholder={placeholder}
        aria-label={t`organization_id`}
      />
    </Stack>
  );
};
