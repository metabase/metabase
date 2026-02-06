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

type TimeseriesUnitPickerProps = {
  projections: ProjectionInfo[];
  selectedUnit: TemporalUnit | undefined;
  onChange: (unit: TemporalUnit) => void;
};

export function TimeseriesUnitPicker({
  projections,
  selectedUnit,
  onChange,
}: TimeseriesUnitPickerProps) {
  const [isOpened, { toggle }] = useDisclosure();

  return (
    <Popover opened={isOpened} onChange={toggle}>
      <Popover.Target>
        <Button onClick={toggle}>{getTemporalUnitLabel(selectedUnit)}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TimeseriesUnitDropdown
          selectedUnit={selectedUnit}
          projections={projections}
          onChange={onChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type TimeseriesBucketDropdownProps = {
  projections: ProjectionInfo[];
  selectedUnit: TemporalUnit | undefined;
  onChange: (unit: TemporalUnit) => void;
};

function TimeseriesUnitDropdown({
  projections,
  selectedUnit,
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
