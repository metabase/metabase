import type { SearchFilterToggle } from "metabase/search/types";
import { Text } from "metabase/ui";
import { FilterSwitch } from "./ToggleSidebarFilter.styled";

export type ToggleSidebarFilterProps = {
  filter: SearchFilterToggle;
  value: boolean;
  onChange: (value: boolean) => void;
  "data-testid"?: string;
};

export const ToggleSidebarFilter = ({
  filter: { label },
  value,
  onChange,
  "data-testid": dataTestId,
}: ToggleSidebarFilterProps) => {
  return (
    <FilterSwitch
      wrapperProps={{
        "data-testid": dataTestId,
      }}
      data-testid="toggle-filter-switch"
      size="sm"
      labelPosition="left"
      label={<Text color="text.2">{label()}</Text>}
      data-is-checked={value}
      checked={value}
      onChange={event => onChange(event.currentTarget.checked)}
    />
  );
};
