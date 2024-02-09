import { t } from "ttag";
import { Switch } from "metabase/ui";
import type { BrowseFilterControlsProps } from "metabase/browse/utils";

export const BrowseFilterControls = ({
  filters,
  setFilter,
}: BrowseFilterControlsProps) => {
  return (
    <Switch
      label={<strong>{t`Only show verified models`}</strong>}
      checked={filters.onlyShowVerifiedModels.active}
      onChange={e => {
        setFilter("onlyShowVerifiedModels", e.target.checked);
      }}
      ml="auto"
      size="sm"
      labelPosition="left"
    />
  );
};
