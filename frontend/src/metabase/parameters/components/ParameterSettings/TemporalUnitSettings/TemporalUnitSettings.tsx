import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Icon,
  Popover,
  Text,
  rem,
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
  const isAll = selectedUnits.length === availableUnits.length;
  const isNone = selectedUnits.length === 0;
  return (
    <Popover width="target">
      <Popover.Target>
        <Button
          fw="normal"
          rightSection={<Icon name="chevrondown" />}
          fullWidth
          px={rem(11)} // needs to be the same as default input paddingLeft in Input.styled.tsx
          justify="space-between"
        >
          {getSelectedText(selectedUnits, isAll, isNone)}
        </Button>
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

  const handleAllToggle = () => {
    if (isAll) {
      onChange([]);
    } else {
      onChange(availableUnits);
    }
  };

  const handleUnitToggle = (selectedUnit: TemporalUnit) => {
    const newSelectedUnits = availableUnits.filter((availableUnit) => {
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
        <Text c="text-secondary" ml="sm">{t`Select all`}</Text>
      </label>
      <Divider />
      {availableUnits.map((unit) => {
        const isSelected = selectedUnitsSet.has(unit);

        return (
          <label key={unit} className={S.label}>
            <Checkbox
              checked={isSelected}
              onChange={() => handleUnitToggle(unit)}
            />
            <Text ml="sm" c="inherit">
              {Lib.describeTemporalUnit(unit)}
            </Text>
          </label>
        );
      })}
    </Box>
  );
}

function getSelectedText(
  selectedUnits: TemporalUnit[],
  isAll: boolean,
  isNone: boolean,
) {
  if (isAll) {
    return t`All`;
  }
  if (isNone) {
    return t`None`;
  }

  const visibleUnitCount = Math.min(selectedUnits.length, VISIBLE_UNIT_LIMIT);
  const hiddenUnitCount = selectedUnits.length - visibleUnitCount;

  return selectedUnits
    .slice(0, visibleUnitCount)
    .map((unit) => Lib.describeTemporalUnit(unit))
    .concat(hiddenUnitCount > 0 ? [`+${hiddenUnitCount}`] : [])
    .join(", ");
}
