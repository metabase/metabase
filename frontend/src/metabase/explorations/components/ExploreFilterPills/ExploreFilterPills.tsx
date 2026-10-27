import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { Group } from "metabase/ui";
import type { HydratedExplorationExploreFilter } from "metabase-types/api";

export type ExploreFilterPill = Pick<
  HydratedExplorationExploreFilter,
  "display_value" | "dimension_name"
>;

export function ExploreFilterPills({
  filters,
}: {
  filters: ExploreFilterPill[];
}) {
  if (filters.length === 0) {
    return null;
  }
  return (
    <Group gap="sm" wrap="wrap">
      {filters.map((filter, index) => (
        <FilterPill key={index} readOnly>
          {exploreFilterPillLabel(filter)}
        </FilterPill>
      ))}
    </Group>
  );
}

export function parseExploreFilterPills(value: unknown): ExploreFilterPill[] {
  if (!Array.isArray(value) || !value.every(isExploreFilterPill)) {
    return [];
  }
  return value;
}

function isExploreFilterPill(value: unknown): value is ExploreFilterPill {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (!("display_value" in value) || typeof value.display_value !== "string") {
    return false;
  }
  if (!("dimension_name" in value) || value.dimension_name == null) {
    return true;
  }
  return typeof value.dimension_name === "string";
}

function exploreFilterPillLabel(filter: ExploreFilterPill): string {
  if (filter.dimension_name) {
    return `${filter.dimension_name}: ${filter.display_value}`;
  }
  return filter.display_value;
}
