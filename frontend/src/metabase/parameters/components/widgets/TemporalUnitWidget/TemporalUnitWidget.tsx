import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

interface TemporalUnitWidgetProps {
  setValue: (unit: string) => void;
}

export function TemporalUnitWidget({ setValue }: TemporalUnitWidgetProps) {
  const units = Lib.availableTemporalUnits();

  return (
    <div>
      {units.map(unit => (
        <Button
          key={unit}
          c="text-dark"
          display="block"
          variant="subtle"
          onClick={() => setValue(unit)}
        >
          {Lib.describeTemporalUnit(unit)}
        </Button>
      ))}
    </div>
  );
}
