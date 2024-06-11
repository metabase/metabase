import { Box, SelectDropdownItem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Parameter, TemporalUnit } from "metabase-types/api";

const MIN_WIDTH = 180;

interface TemporalUnitWidgetProps {
  parameter: Parameter;
  value: TemporalUnit;
  setValue: (unit: string) => void;
  onClose: () => void;
}

export function TemporalUnitWidget({
  parameter,
  value,
  setValue,
  onClose,
}: TemporalUnitWidgetProps) {
  const availableTemporalUnits =
    parameter.temporal_units ?? Lib.availableTemporalUnits();

  const handleSelect = (unit: string) => {
    setValue(unit);
    onClose();
  };

  return (
    <Box p="sm" miw={MIN_WIDTH}>
      {availableTemporalUnits.map(unit => (
        <SelectDropdownItem
          key={unit}
          value={Lib.describeTemporalUnit(unit)}
          isSelected={value === unit}
          onClick={() => handleSelect(unit)}
        />
      ))}
    </Box>
  );
}
