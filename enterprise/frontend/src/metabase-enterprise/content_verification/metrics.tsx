import { type ChangeEvent, useCallback } from "react";
import { t } from "ttag";

import type {
  MetricFilterControlsProps,
  MetricFilterSettings,
} from "metabase/browse/metrics";
import { useUserSetting } from "metabase/common/hooks";
import { getSetting } from "metabase/selectors/settings";
import { Button, Icon, Paper, Popover, Switch, Text } from "metabase/ui";
import type { State } from "metabase-types/store";

const USER_SETTING_KEY = "browse-filter-only-verified-metrics";

export function getDefaultMetricFilters(state: State): MetricFilterSettings {
  return {
    verified: getSetting(state, USER_SETTING_KEY) ?? false,
  };
}

// This component is similar to the ModelFilterControls component from ./ModelFilterControls.tsx
// merging them might be a good idea in the future.
export const MetricFilterControls = ({
  metricFilters,
  setMetricFilters,
}: MetricFilterControlsProps) => {
  const areAnyFiltersActive = Object.values(metricFilters).some(Boolean);

  const [_, setUserSetting] = useUserSetting(USER_SETTING_KEY);

  const handleVerifiedFilterChange = useCallback(
    function (evt: ChangeEvent<HTMLInputElement>) {
      setMetricFilters({ ...metricFilters, verified: evt.target.checked });
      setUserSetting(evt.target.checked);
    },
    [metricFilters, setMetricFilters, setUserSetting],
  );

  return (
    <Popover position="bottom-end">
      <Popover.Target>
        <Button
          p="sm"
          lh={0}
          variant="subtle"
          color="text-dark"
          pos="relative"
          aria-label={t`Filters`}
        >
          {areAnyFiltersActive && <Dot />}
          <Icon name="filter" />
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="lg">
        <Switch
          label={
            <Text
              align="end"
              weight="bold"
            >{t`Show verified metrics only`}</Text>
          }
          role="switch"
          checked={Boolean(metricFilters.verified)}
          onChange={handleVerifiedFilterChange}
          labelPosition="left"
        />
      </Popover.Dropdown>
    </Popover>
  );
};

const Dot = () => {
  return (
    <Paper
      pos="absolute"
      right="0px"
      top="7px"
      radius="50%"
      bg={"var(--mb-color-brand)"}
      w="sm"
      h="sm"
      data-testid="filter-dot"
    />
  );
};
