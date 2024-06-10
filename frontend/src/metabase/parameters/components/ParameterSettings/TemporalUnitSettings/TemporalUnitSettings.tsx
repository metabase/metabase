import { SelectInput, Popover, Box, Checkbox, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./TemporalUnitSettings.module.css";

export function TemporalUnitSettings() {
  return (
    <Popover>
      <Popover.Target>
        <SelectInput value="123" />
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitList />
      </Popover.Dropdown>
    </Popover>
  );
}

function TemporalUnitList() {
  const availableUnits = Lib.availableTemporalUnits();

  return (
    <Box p="sm">
      {availableUnits.map(unit => (
        <label key={unit} className={S.label}>
          <Checkbox />
          <Text ml="sm">{Lib.describeTemporalUnit(unit)}</Text>
        </label>
      ))}
    </Box>
  );
}
