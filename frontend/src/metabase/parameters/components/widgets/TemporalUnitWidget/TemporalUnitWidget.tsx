import { Box, Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Parameter } from "metabase-types/api";

const MIN_WIDTH = 180;

interface TemporalUnitWidgetProps {
  parameter: Parameter;
  setValue: (unit: string) => void;
  onClose: () => void;
}

export function TemporalUnitWidget({
  parameter,
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
        <Button
          key={unit}
          c="text-dark"
          display="block"
          variant="subtle"
          onClick={() => handleSelect(unit)}
        >
          {Lib.describeTemporalUnit(unit)}
        </Button>
      ))}
    </Box>
  );
}
