import { t } from "ttag";

import {
  Box,
  Checkbox,
  Divider,
  Popover,
  Text,
  SelectInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Parameter, TemporalUnit } from "metabase-types/api";

import S from "./TemporalUnitSettings.module.css";

const VISIBLE_UNIT_LIMIT = 3;

interface TemporalUnitSettingsProps {
  parameter: Parameter;
  onChangeTemporalUnits: (temporalUnits: TemporalUnit[]) => void;
}

export function TemporalUnitSettings({
  parameter,
  onChangeTemporalUnits,
}: TemporalUnitSettingsProps) {
  const availableUnits = Lib.availableTemporalUnits();
  const selectedUnits = parameter.temporal_units ?? availableUnits;

  return (
    <Popover width="target">
      <Popover.Target>
        <SelectInput value={getSelectedText(selectedUnits, availableUnits)} />
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitDropdown
          selectedUnits={selectedUnits}
          availableUnits={availableUnits}
          onChange={onChangeTemporalUnits}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface TemporalUnitDropdownProps {
  selectedUnits: TemporalUnit[];
  availableUnits: TemporalUnit[];
  onChange: (selectedUnits: TemporalUnit[]) => void;
}

function TemporalUnitDropdown({
  selectedUnits,
  availableUnits,
  onChange,
}: TemporalUnitDropdownProps) {
  const selectedUnitsSet = new Set(selectedUnits);
  const isAll = selectedUnits.length === availableUnits.length;
  const isNone = selectedUnits.length === 0;
  const isDisabledDeselection = selectedUnitsSet.size <= 1;

  const handleAllToggle = () => {
    if (isAll) {
      onChange([availableUnits[0]]);
    } else {
      onChange(availableUnits);
    }
  };

  const handleUnitToggle = (selectedUnit: TemporalUnit) => {
    const newSelectedUnits = availableUnits.filter(availableUnit => {
      if (availableUnit === selectedUnit) {
        return !selectedUnitsSet.has(selectedUnit);
      } else {
        return selectedUnitsSet.has(availableUnit);
      }
    });

    onChange(newSelectedUnits);
  };

  return (
    <Box p="sm">
      <label className={S.label}>
        <Checkbox
          checked={isAll}
          indeterminate={!isAll && !isNone}
          variant="stacked"
          onChange={handleAllToggle}
        />
        <Text ml="sm">{isAll ? t`Select none` : t`Select all`}</Text>
      </label>
      <Divider />
      {availableUnits.map(unit => {
        const isSelected = selectedUnitsSet.has(unit);
        const isDisabled = isSelected && isDisabledDeselection;

        return (
          <label key={unit} className={S.label}>
            <Checkbox
              checked={isSelected}
              disabled={isDisabled}
              onChange={() => handleUnitToggle(unit)}
            />
            <Text ml="sm">{Lib.describeTemporalUnit(unit)}</Text>
          </label>
        );
      })}
    </Box>
  );
}

function getSelectedText(
  selectedUnits: TemporalUnit[],
  availableUnits: TemporalUnit[],
) {
  if (selectedUnits.length === availableUnits.length) {
    return t`All`;
  }

  const visibleUnits = selectedUnits.slice(0, VISIBLE_UNIT_LIMIT);
  const invisibleUnits = selectedUnits.slice(VISIBLE_UNIT_LIMIT);
  const visibleSections = [
    ...visibleUnits.map(unit => Lib.describeTemporalUnit(unit)),
    ...(invisibleUnits.length > 0 ? [`+${invisibleUnits.length}`] : []),
  ];
  return visibleSections.join(", ");
}
