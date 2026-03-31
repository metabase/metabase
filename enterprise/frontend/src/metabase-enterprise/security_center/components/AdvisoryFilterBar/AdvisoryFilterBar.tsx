import { t } from "ttag";

import { Checkbox, Group, Select } from "metabase/ui";

import type { AdvisoryFilter, AdvisorySeverity } from "../../types";

interface AdvisoryFilterBarProps {
  filter: AdvisoryFilter;
  onChange: (filter: AdvisoryFilter) => void;
  className?: string;
}

type SelectOption<T extends string> = { value: T; label: string };

export function AdvisoryFilterBar({
  filter,
  onChange,
  className,
}: AdvisoryFilterBarProps) {
  const severityOptions: SelectOption<AdvisorySeverity | "all">[] = [
    { value: "all", label: t`All severities` },
    { value: "critical", label: t`Critical` },
    { value: "high", label: t`High` },
    { value: "medium", label: t`Medium` },
    { value: "low", label: t`Low` },
  ];

  const statusOptions: SelectOption<AdvisoryFilter["status"]>[] = [
    { value: "all", label: t`All statuses` },
    { value: "affected", label: t`Affected` },
    { value: "not-affected", label: t`Not affected` },
  ];

  return (
    <Group gap="md" data-testid="advisory-filter-bar" className={className}>
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
