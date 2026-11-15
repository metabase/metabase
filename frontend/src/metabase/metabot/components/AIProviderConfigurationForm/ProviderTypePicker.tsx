import { t } from "ttag";

import { Group, SimpleGrid, Text, UnstyledButton } from "metabase/ui";
import type { LlmProviderType } from "metabase-types/api";

import { ProviderTypeIcon } from "./ProviderTypeIcon";
import S from "./ProviderTypePicker.module.css";

export function ProviderTypePicker({
  providerTypes,
  onSelect,
}: {
  providerTypes: LlmProviderType[];
  onSelect: (type: string) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {providerTypes.map((providerType) => (
        <UnstyledButton
          className={S.option}
          key={providerType.type}
          disabled={!providerType.available}
          onClick={() => onSelect(providerType.type)}
        >
          <Group
            className={S.content}
            gap="sm"
            justify="space-between"
            wrap="nowrap"
          >
            <Group gap="sm" wrap="nowrap">
              <ProviderTypeIcon type={providerType.type} />
              <Text fw="bold">{providerType.label}</Text>
            </Group>
            {!providerType.available && (
              <Text c="text-disabled" size="sm">
                {t`Unavailable`}
              </Text>
            )}
          </Group>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}
