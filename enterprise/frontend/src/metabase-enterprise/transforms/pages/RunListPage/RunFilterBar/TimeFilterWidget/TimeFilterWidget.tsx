import { useDisclosure } from "@mantine/hooks";

import type {
  DatePickerShortcut,
  RelativeIntervalDirection,
} from "metabase/querying/filters/types";
import { SearchFilterDateDisplay } from "metabase/search/components/SearchFilterDateDisplay";
import { SearchFilterDatePicker } from "metabase/search/components/SearchFilterDatePicker";
import { Popover } from "metabase/ui";

import { FilterFieldSet } from "../FilterFieldSet";

type TimeFilterWidgetProps = {
  label: string;
  value: string | undefined;
  availableShortcuts?: DatePickerShortcut[];
  availableDirections?: RelativeIntervalDirection[];
  onChange: (value: string | undefined) => void;
};

export function TimeFilterWidget({
  label,
  value,
  onChange,
  availableShortcuts,
  availableDirections,
}: TimeFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  function handleRemove() {
    onChange(undefined);
  }

  function handleChange(value: string | null) {
    close();
    onChange(value ?? undefined);
  }

  const displayValue = value ? (
    <SearchFilterDateDisplay label={label} value={value} />
  ) : null;

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={label}
          displayValue={displayValue}
          icon="calendar"
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <SearchFilterDatePicker
          value={value ?? null}
          onChange={handleChange}
          availableShortcuts={availableShortcuts}
          availableDirections={availableDirections}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
