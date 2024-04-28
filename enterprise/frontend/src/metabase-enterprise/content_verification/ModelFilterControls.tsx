import { t } from "ttag";

import type { ModelFilterControlsProps } from "metabase/browse/utils";
import { Switch, Text } from "metabase/ui";

export const ModelFilterControls = ({
  actualModelFilters,
  handleModelFilterChange,
}: ModelFilterControlsProps) => {
  const checked = actualModelFilters.onlyShowVerifiedModels;
  return (
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
  );
};
