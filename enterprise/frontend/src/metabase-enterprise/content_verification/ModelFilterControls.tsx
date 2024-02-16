import { t } from "ttag";
import { Switch, Text } from "metabase/ui";
import type { ModelFilterControlsProps } from "metabase/browse/utils";

export const ModelFilterControls = ({
  actualModelFilters,
  handleModelFilterChange,
}: ModelFilterControlsProps) => {
  const checked = actualModelFilters.onlyShowVerifiedModels;
  return (
    <Switch
      label={
        <Text
          align="right"
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
      ml="auto"
      size="sm"
      labelPosition="left"
      styles={{
        root: { display: "flex", alignItems: "center" },
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
  );
};
