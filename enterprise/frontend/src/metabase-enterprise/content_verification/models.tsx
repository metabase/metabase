import { type ChangeEvent, useCallback } from "react";
import { t } from "ttag";

import type {
  ModelFilterControlsProps,
  ModelFilterSettings,
} from "metabase/browse/models";
import { useUserSetting } from "metabase/common/hooks";
import { getSetting } from "metabase/selectors/settings";
import { Button, Icon, Paper, Popover, Switch, Text } from "metabase/ui";
import type { State } from "metabase-types/store";

const USER_SETTING_KEY = "browse-filter-only-verified-models";

export function getDefaultModelFilters(state: State): ModelFilterSettings {
  return {
    verified: getSetting(state, USER_SETTING_KEY) ?? false,
  };
}

// This component is similar to the MetricFilterControls component from ./MetricFilterControls.tsx
// merging them might be a good idea in the future.
export const ModelFilterControls = ({
  modelFilters,
  setModelFilters,
}: ModelFilterControlsProps) => {
  const areAnyFiltersActive = Object.values(modelFilters).some(Boolean);

  const [_, setUserSetting] = useUserSetting(USER_SETTING_KEY);

  const handleVerifiedFilterChange = useCallback(
    function (evt: ChangeEvent<HTMLInputElement>) {
      setModelFilters({ ...modelFilters, verified: evt.target.checked });
      setUserSetting(evt.target.checked);
    },
    [modelFilters, setModelFilters, setUserSetting],
  );

  return (
    <Popover position="bottom-end">
      <Popover.Target>
        <Button
          p="sm"
          lh={0}
          variant="subtle"
          color="var(--mb-color-text-dark)"
          pos="relative"
          aria-label={t`Filters`}
        >
          {areAnyFiltersActive && <Dot />}
          <Icon name="filter" />
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="lg">
        <Switch
          label={<Text ta="end" fw="bold">{t`Show verified models only`}</Text>}
          role="switch"
          checked={Boolean(modelFilters.verified)}
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
