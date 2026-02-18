import { t } from "ttag";

import { Autocomplete, Stack, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { useFieldDistinctValues } from "./hooks/use-field-distinct-values";

export const TenantIdentifierInput = ({
  value,
  onChange,
  selectedFieldIds,
}: {
  value: string;
  onChange: (value: string) => void;
  selectedFieldIds?: FieldId[];
}) => {
  // Fetch value from first field
  // We expect all tables to share the same multi-tenancy column anyway,
  // and it should share the same tenant_id value.
  const firstFieldId = selectedFieldIds?.[0];

  const { values: suggestions } = useFieldDistinctValues(firstFieldId);

  // Use first suggestion as placeholder hint, fallback to "1"
  const placeholder = suggestions[0] ?? "1";

  return (
    <Stack gap="xs">
      <Text fw="bold" size="sm">
        {t`tenant_identifier`}
      </Text>

      <Text c="text-secondary" size="xs" mb="sm">
        {t`Users will only see rows where this matches the value in the column you selected.`}
      </Text>

      <Autocomplete
        value={value}
        onChange={onChange}
        data={suggestions}
        placeholder={placeholder}
      />
    </Stack>
  );
};
