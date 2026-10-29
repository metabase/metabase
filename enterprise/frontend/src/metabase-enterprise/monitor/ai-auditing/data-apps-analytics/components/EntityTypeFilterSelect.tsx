import { t } from "ttag";

import { Select } from "metabase/ui";
import {
  DATA_APP_ENTITY_TYPES,
  type DataAppEntityType,
  parseDataAppEntityType,
} from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import { FILTER_WIDTH } from "metabase-enterprise/monitor/constants";

const ALL_ENTITY_TYPES = "";

export function getEntityTypeLabel(entityType: DataAppEntityType): string {
  switch (entityType) {
    case "question":
      return t`Question`;
    case "action":
      return t`Action`;
  }
}

type EntityTypeFilterSelectProps = {
  value: DataAppEntityType | null;
  onChange: (value: DataAppEntityType | null) => void;
};

export function EntityTypeFilterSelect({
  value,
  onChange,
}: EntityTypeFilterSelectProps) {
  return (
    <Select
      data={[
        { value: ALL_ENTITY_TYPES, label: t`All entity types` },
        ...DATA_APP_ENTITY_TYPES.map((entityType) => ({
          value: entityType,
          label: getEntityTypeLabel(entityType),
        })),
      ]}
      value={value ?? ALL_ENTITY_TYPES}
      onChange={(val) => onChange(parseDataAppEntityType(val))}
      aria-label={t`Entity type`}
      w={FILTER_WIDTH}
      bdrs="xs"
      data-testid="entity-type-filter-select"
    />
  );
}
