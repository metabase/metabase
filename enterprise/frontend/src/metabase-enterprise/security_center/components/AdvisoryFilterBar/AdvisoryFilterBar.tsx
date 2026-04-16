import { t } from "ttag";

import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import { Box, Checkbox, Group, Select, Stack } from "metabase/ui";
import type { AdvisorySeverity } from "metabase-types/api";

import type { AdvisoryFilter } from "../../types";

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
  const isSmallScreen = useIsSmallScreen();

  const severityOptions: SelectOption<AdvisorySeverity | "all">[] = [
    { value: "all", label: t`All severities` },
    { value: "critical", label: t`Critical` },
    { value: "high", label: t`High` },
    { value: "medium", label: t`Medium` },
    { value: "low", label: t`Low` },
  ];

  const Wrapper = isSmallScreen ? Stack : Group;

  return (
    <Wrapper gap="md" data-testid="advisory-filter-bar" className={className}>
      <Select
        data={severityOptions}
        value={filter.severity}
        onChange={(value) =>
          onChange({
            ...filter,
            severity: value ?? "all",
          })
        }
        w={isSmallScreen ? "100%" : 180}
        data-testid="severity-filter"
      />
      <Box style={{ flex: 1 }} />
      <Checkbox
        label={t`Show dismissed`}
        checked={filter.showAcknowledged}
        onChange={(e) =>
          onChange({ ...filter, showAcknowledged: e.currentTarget.checked })
        }
        data-testid="show-acknowledged-filter"
      />
    </Wrapper>
  );
}
