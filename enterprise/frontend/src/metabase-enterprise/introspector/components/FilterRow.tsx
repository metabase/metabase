import { c, t } from "ttag";

import { Chip, Group, Icon, Select, Text, TextInput } from "metabase/ui";
import {
  type DateFilter,
  dateFilterOptions,
  isDateFilter,
} from "metabase-enterprise/clean_up/CleanupCollectionModal/utils";

import type { IntrospectorCondition } from "../types";

interface Props {
  conditions: Set<IntrospectorCondition>;
  onToggleCondition: (c: IntrospectorCondition) => void;
  search: string;
  onSearchChange: (v: string) => void;
  availableConditions?: IntrospectorCondition[];
  /**
   * Optional staleness threshold picker. Reuses the same {1 month … 2 years}
   * options as the cleanup collection modal at
   * `enterprise/.../clean_up/CleanupCollectionModal/CleanupCollectionModalFilters.tsx`
   * so the introspector's notion of "stale" matches what users see when they
   * trash items from a collection. When omitted, no picker renders.
   */
  staleness?: {
    value: DateFilter;
    onChange: (next: DateFilter) => void;
  };
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
  staleness,
}: Props) {
  const staleActive = conditions.has("stale");
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
      {staleness && (
        <Text
          size="sm"
          c={staleActive ? "text-primary" : "text-secondary"}
          display="inline-flex"
          style={{ alignItems: "center" }}
        >
          {c("{0} is a duration (e.g.: 3 months)").jt`Not used in over ${(
            <Select
              key="stale-select"
              ml="xs"
              leftSection={<Icon name="calendar" />}
              data={dateFilterOptions}
              value={staleness.value}
              disabled={!staleActive}
              onChange={(next) => {
                if (next && isDateFilter(next)) {
                  staleness.onChange(next);
                }
              }}
              w={150}
              data-testid="introspector-stale-threshold"
            />
          )}`}
        </Text>
      )}
      <TextInput
        placeholder={t`Search name…`}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        style={{ flex: 1, minWidth: 200 }}
      />
    </Group>
  );
}
