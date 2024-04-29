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
        <Button p="sm" variant="subtle" color="text-dark">
          <Icon name="filter" />
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="lg">
        <Switch
          label={
            <Text
              align="end"
              weight="bold"
              lh="1rem"
              px=".75rem"
            >{t`Only show verified models`}</Text>
          }
          role="switch"
          checked={checked}
          aria-checked={checked}
          onChange={e => {
            handleModelFilterChange("onlyShowVerifiedModels", e.target.checked);
          }}
          size="sm"
          labelPosition="left"
          styles={{
            root: {
              marginInlineStart: "auto",
              display: "flex",
              alignItems: "center",
            },
            body: {
              alignItems: "center",
              // Align with tab labels:
              position: "relative",
              top: "-.5px",
            },
            labelWrapper: { justifyContent: "center", padding: 0 },
            track: { marginTop: "-1.5px" },
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
