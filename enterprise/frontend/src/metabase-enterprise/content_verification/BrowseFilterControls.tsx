import { t } from "ttag";
import { Switch, Text } from "metabase/ui";
import type { BrowseFilterControlsProps } from "metabase/browse/utils";

export const BrowseFilterControls = ({
  actualModelFilters,
  handleModelFilterChange,
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
      checked={actualModelFilters.onlyShowVerifiedModels}
      onChange={e => {
        handleModelFilterChange("onlyShowVerifiedModels", e.target.checked);
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
