import { t } from "ttag";

import { Group, Select, Text } from "metabase/ui";
import type { LlmProviderType } from "metabase-types/api";

export function ProviderTypeSelect({
  providerTypes,
  value,
  onChange,
}: {
  providerTypes: LlmProviderType[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const options = providerTypes.map((providerType) => ({
    value: providerType.type,
    label: providerType.label,
    disabled: !providerType.available,
  }));

  return (
    <Select
      label={t`Provider`}
      placeholder={t`Select a provider`}
      data={options}
      value={value ?? null}
      onChange={(next) => next && onChange(next)}
      renderOption={({ option }) => (
        <Group gap="xs" p="sm" justify="space-between" wrap="nowrap" w="100%">
          <Text lh="1rem" c={option.disabled ? "text-disabled" : undefined}>
            {option.label}
          </Text>
          {option.disabled && (
            <Text c="text-disabled" lh="1rem" size="sm">
              {t`Unavailable`}
            </Text>
          )}
        </Group>
      )}
    />
  );
}
