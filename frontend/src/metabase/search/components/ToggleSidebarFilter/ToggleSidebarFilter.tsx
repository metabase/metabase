import type { SearchFilterToggle } from "metabase/search/types";
import { Text, Switch } from "metabase/ui";

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
    <Switch
      wrapperProps={{
        "data-testid": dataTestId,
      }}
      variant="stretch"
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
