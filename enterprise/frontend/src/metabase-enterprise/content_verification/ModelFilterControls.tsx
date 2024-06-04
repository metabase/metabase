import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  ActualModelFilters,
  ModelFilterControlsProps,
} from "metabase/browse/utils";
import { useUserSetting } from "metabase/common/hooks";
import { Button, Icon, Popover, Switch, Text } from "metabase/ui";

export const ModelFilterControls = ({
  actualModelFilters,
  setActualModelFilters,
}: ModelFilterControlsProps) => {
  const [__, setVerifiedFilterStatus] = useUserSetting(
    "browse-filter-only-verified-models",
    { shouldRefresh: false },
  );
  const setVerifiedFilterStatusDebounced = _.debounce(
    setVerifiedFilterStatus,
    200,
  );

  const handleModelFilterChange = useCallback(
    (modelFilterName: string, active: boolean) => {
      // For now, only one filter is supported
      setVerifiedFilterStatusDebounced(active);
      setActualModelFilters((prev: ActualModelFilters) => {
        return { ...prev, [modelFilterName]: active };
      });
    },
    [setActualModelFilters, setVerifiedFilterStatusDebounced],
  );

  const checked = actualModelFilters.onlyShowVerifiedModels;
  return (
    <Popover position="bottom-end">
      <Popover.Target>
        <Button p="sm" lh={0} variant="subtle" color="text-dark">
          <Icon name="filter" />
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="lg">
        <Switch
          label={
            <Text
              align="end"
              weight="bold"
            >{t`Show verified models only`}</Text>
          }
          role="switch"
          checked={checked}
          onChange={e => {
            handleModelFilterChange("onlyShowVerifiedModels", e.target.checked);
          }}
          labelPosition="left"
        />
      </Popover.Dropdown>
    </Popover>
  );
};
