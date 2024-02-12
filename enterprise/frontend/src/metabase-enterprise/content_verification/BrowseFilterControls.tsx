import { t } from "ttag";
import { Switch, Text } from "metabase/ui";
import type { BrowseFilterControlsProps } from "metabase/browse/utils";

export const BrowseFilterControls = ({
  filters,
  toggleFilter,
}: BrowseFilterControlsProps) => {
  return (
    <Switch
      label={
        <Text
          align="right"
          weight="bold"
          lh="1rem"
        >{t`Only show verified models`}</Text>
      }
      checked={filters.onlyShowVerifiedModels.active}
      onChange={e => {
        toggleFilter("onlyShowVerifiedModels", e.target.checked);
      }}
      ml="auto"
      size="sm"
      labelPosition="left"
      styles={{
        body: { alignItems: "center" },
        labelWrapper: { justifyContent: "center" },
        track: { marginTop: "-.5px" },
      }}
    />
  );
};
