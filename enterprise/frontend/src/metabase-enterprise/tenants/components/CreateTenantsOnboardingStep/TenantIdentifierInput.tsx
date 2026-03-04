import { c, t } from "ttag";

import { Autocomplete, Stack, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { useFieldDistinctValues } from "./hooks/use-field-distinct-values";
import { getIsolationFieldConfig } from "./isolation-field-config";

export const TenantIdentifierInput = ({
  value,
  onChange,
  selectedFieldIds,
}: {
  value: string;
  onChange: (value: string) => void;
  selectedFieldIds?: FieldId[];
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

  return (
    <Stack gap="xs">
      <Text fw="bold" size="sm">
        {config.label}
      </Text>

      <Text c="text-secondary" size="xs" mb="sm">
        {config.description}
      </Text>

      <Autocomplete
        value={value}
        onChange={onChange}
        data={suggestions}
        placeholder={placeholder}
        aria-label={t`tenant_identifier`}
      />
    </Stack>
  );
};
