import { FilterSwitch } from "metabase/search/components/ToggleSidebarFilter/ToggleSidebarFilter.styled";
import type { SearchFilterToggle } from "metabase/search/types";
import { Text } from "metabase/ui";

export type ToggleSidebarFilterProps = {
  filter: SearchFilterToggle;
  value: boolean;
  onChange: (value: boolean) => void;
};

export const ToggleSidebarFilter = ({
  filter: { label },
  value,
  onChange,
}: ToggleSidebarFilterProps) => {
  return (
    <FilterSwitch
      wrapperProps={{
        "data-testid": "toggle-filter-switch",
      }}
      size="sm"
      labelPosition="left"
      label={<Text color="text.2">{label()}</Text>}
      data-is-checked={value}
      checked={value}
      onChange={event => onChange(event.currentTarget.checked)}
    />
  );
};
