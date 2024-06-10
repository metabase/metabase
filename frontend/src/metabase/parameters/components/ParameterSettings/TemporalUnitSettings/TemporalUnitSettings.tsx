import { useMemo } from "react";
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
  const availableUnits = useMemo(() => Lib.availableTemporalUnits(), []);
  const selectedUnits = parameter.temporal_units ?? availableUnits;
  const isAll = selectedUnits.length === availableUnits.length;
  const isNone = selectedUnits.length === 0;
  const selectedText = useMemo(
    () => getSelectedText(selectedUnits, isAll),
    [selectedUnits, isAll],
  );

  return (
    <Popover width="target">
      <Popover.Target>
        <SelectInput value={selectedText} />
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitDropdown
          selectedUnits={selectedUnits}
          availableUnits={availableUnits}
          isAll={isAll}
          isNone={isNone}
          onChange={onChangeTemporalUnits}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface TemporalUnitDropdownProps {
  selectedUnits: TemporalUnit[];
  availableUnits: TemporalUnit[];
  isAll: boolean;
  isNone: boolean;
  onChange: (selectedUnits: TemporalUnit[]) => void;
}

function TemporalUnitDropdown({
  selectedUnits,
  availableUnits,
  isAll,
  isNone,
  onChange,
}: TemporalUnitDropdownProps) {
  const selectedUnitsSet = new Set(selectedUnits);
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

function getSelectedText(units: TemporalUnit[], isAll: boolean) {
  if (isAll) {
    return t`All`;
  }

  const visibleUnits = units.slice(0, VISIBLE_UNIT_LIMIT);
  const invisibleUnits = units.slice(VISIBLE_UNIT_LIMIT);
  const visibleSections = [
    ...visibleUnits.map(unit => Lib.describeTemporalUnit(unit)),
    ...(invisibleUnits.length > 0 ? [`+${invisibleUnits.length}`] : []),
  ];
  return visibleSections.join(", ");
}
