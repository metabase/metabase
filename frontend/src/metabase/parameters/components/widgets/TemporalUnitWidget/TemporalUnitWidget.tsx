import { Box, Button } from "metabase/ui";
import * as Lib from "metabase-lib";

const MIN_WIDTH = 180;

interface TemporalUnitWidgetProps {
  setValue: (unit: string) => void;
  onClose: () => void;
}

export function TemporalUnitWidget({
  setValue,
  onClose,
}: TemporalUnitWidgetProps) {
  const units = Lib.availableTemporalUnits();

  const handleSelect = (unit: string) => {
    setValue(unit);
    onClose();
  };

  return (
    <Box p="sm" miw={MIN_WIDTH}>
      {units.map(unit => (
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
