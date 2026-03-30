import { t } from "ttag";

import { Checkbox, Group, Select } from "metabase/ui";

import type { AdvisoryFilter } from "../../types";

interface AdvisoryFilterBarProps {
  filter: AdvisoryFilter;
  onChange: (filter: AdvisoryFilter) => void;
}

export function AdvisoryFilterBar({
  filter,
  onChange,
}: AdvisoryFilterBarProps) {
  const severityOptions = [
    { value: "all", label: t`All severities` },
    { value: "critical", label: t`Critical` },
    { value: "high", label: t`High` },
    { value: "medium", label: t`Medium` },
    { value: "low", label: t`Low` },
  ];

  const statusOptions = [
    { value: "all", label: t`All statuses` },
    { value: "affected", label: t`Affected` },
    { value: "not-affected", label: t`Not affected` },
  ];

  return (
    <Group gap="md" data-testid="advisory-filter-bar">
      <Select
        data={severityOptions}
        value={filter.severity}
        onChange={(value) =>
          onChange({
            ...filter,
            severity: (value as AdvisoryFilter["severity"]) ?? "all",
          })
        }
        w={180}
        data-testid="severity-filter"
      />
      <Select
        data={statusOptions}
        value={filter.status}
        onChange={(value) =>
          onChange({
            ...filter,
            status: (value as AdvisoryFilter["status"]) ?? "all",
          })
        }
        w={180}
        data-testid="status-filter"
      />
      <Checkbox
        label={t`Show acknowledged`}
        checked={filter.showAcknowledged}
        onChange={(e) =>
          onChange({ ...filter, showAcknowledged: e.currentTarget.checked })
        }
        data-testid="show-acknowledged-filter"
      />
    </Group>
  );
}
