import { t } from "ttag";
import { Switch, Text } from "metabase/ui";
import type { ModelFilterControlsProps } from "metabase/browse/utils";

export const ModelFilterControls = ({
  actualModelFilters,
  handleModelFilterChange,
}: ModelFilterControlsProps) => {
  return (
    <Switch
      label={
        <Text
          align="right"
          weight="bold"
          lh="1rem"
          pr=".25rem"
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
        labelWrapper: { justifyContent: "center", padding: 0 },
        track: { marginTop: "-.5px" },
      }}
    />
  );
};
