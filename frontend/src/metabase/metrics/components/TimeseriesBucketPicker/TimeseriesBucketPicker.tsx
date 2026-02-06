import { useDisclosure } from "@mantine/hooks";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button, Popover } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

import type { ProjectionInfo } from "./types";
import {
  getSharedTemporalUnitItems,
  getSharedTemporalUnits,
  getTemporalUnitLabel,
} from "./utils";

type TimeseriesBucketPickerProps = {
  selectedUnit: TemporalUnit | undefined;
  projections: ProjectionInfo[];
  onChange: (unit: TemporalUnit) => void;
};

export function TimeseriesBucketPicker({
  selectedUnit,
  projections,
  onChange,
}: TimeseriesBucketPickerProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleChange = (unit: TemporalUnit) => {
    onChange(unit);
    close();
  };

  return (
    <Popover opened={isOpened} onChange={toggle}>
      <Popover.Target>
        <Button onClick={toggle}>{getTemporalUnitLabel(selectedUnit)}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TimeseriesBucketDropdown
          selectedUnit={selectedUnit}
          projections={projections}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type TimeseriesBucketDropdownProps = {
  selectedUnit: TemporalUnit | undefined;
  projections: ProjectionInfo[];
  onChange: (unit: TemporalUnit) => void;
};

function TimeseriesBucketDropdown({
  selectedUnit,
  projections,
  onChange,
}: TimeseriesBucketDropdownProps) {
  const sharedUnits = getSharedTemporalUnits(projections);
  const sharedUnitItems = getSharedTemporalUnitItems(sharedUnits);

  return (
    <TemporalUnitPicker
      value={selectedUnit}
      availableItems={sharedUnitItems}
      onChange={onChange}
    />
  );
}
