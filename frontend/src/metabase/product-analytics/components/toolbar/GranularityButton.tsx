import { useState } from "react";
import { c } from "ttag";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { Granularity } from "../../analyses/types";

type GranularityButtonProps = {
  value: Granularity;
  /** The units the analysis can bucket by. */
  units: readonly Granularity[];
  onChange: (value: Granularity) => void;
};

export const GranularityButton = ({
  value,
  units,
  onChange,
}: GranularityButtonProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const unitName = Lib.describeTemporalUnit(value).toLowerCase();
  const items = units.map((unit) => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));

  return (
    <Popover opened={isOpened} position="bottom-end" onChange={setIsOpened}>
      <Popover.Target>
        <Button variant="default" onClick={() => setIsOpened(!isOpened)}>
          {c("{0} is a time unit, like 'week'").t`by ${unitName}`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitPicker
          value={value}
          availableItems={items}
          onChange={(newUnit) => {
            const newValue = units.find((unit) => unit === newUnit);
            if (newValue !== undefined && newValue !== value) {
              onChange(newValue);
            }
            setIsOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
