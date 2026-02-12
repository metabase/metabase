import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import * as Lib from "metabase-lib";
import type { Parameter, TemporalUnit } from "metabase-types/api";

interface TemporalUnitWidgetProps {
  parameter: Parameter;
  value: TemporalUnit | undefined;
  setValue: (unit: TemporalUnit) => void;
  onClose: () => void;
}

export function TemporalUnitWidget({
  parameter,
  value,
  setValue,
  onClose,
}: TemporalUnitWidgetProps) {
  const availableUnits =
    parameter.temporal_units ?? Lib.availableTemporalUnits();
  const availableItems = availableUnits.map((unit) => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));

  const handleChange = (unit: TemporalUnit) => {
    setValue(unit);
    onClose();
  };

  return (
    <TemporalUnitPicker
      value={value}
      availableItems={availableItems}
      onChange={handleChange}
    />
  );
}
