import { t } from "ttag";

import { Chip, Group, TextInput } from "metabase/ui";

import type { IntrospectorCondition } from "../types";

interface Props {
  conditions: Set<IntrospectorCondition>;
  onToggleCondition: (c: IntrospectorCondition) => void;
  search: string;
  onSearchChange: (v: string) => void;
  availableConditions?: IntrospectorCondition[];
}

const LABELS: Record<IntrospectorCondition, string> = {
  stale: "Stale",
  broken: "Broken",
  unreferenced: "Unreferenced",
};

export function FilterRow({
  conditions,
  onToggleCondition,
  search,
  onSearchChange,
  availableConditions = ["broken", "stale", "unreferenced"],
}: Props) {
  return (
    <Group gap="sm" mb="md" wrap="wrap">
      {availableConditions.map((c) => (
        <Chip
          key={c}
          checked={conditions.has(c)}
          onChange={() => onToggleCondition(c)}
          variant="outline"
        >
          {LABELS[c]}
        </Chip>
      ))}
      <TextInput
        placeholder={t`Search name…`}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        style={{ flex: 1, minWidth: 200 }}
      />
    </Group>
  );
}
