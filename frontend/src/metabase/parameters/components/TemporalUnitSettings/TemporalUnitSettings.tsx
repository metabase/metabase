import type { KeyboardEvent } from "react";
import { t } from "ttag";

import { SelectButton } from "metabase/common/components/SelectButton";
import { Checkbox, Combobox, Popover, useCombobox } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Parameter, TemporalUnit } from "metabase-types/api";

import S from "./TemporalUnitSettings.module.css";

const VISIBLE_UNIT_LIMIT = 3;

// Unit option values are temporal unit names, so this can't collide with one.
const SELECT_ALL_VALUE = "select-all";

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
    <Popover width="target" trapFocus returnFocus>
      <Popover.Target>
        <SelectButton>
          {getSelectedText(selectedUnits, isAll, isNone)}
        </SelectButton>
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
  const combobox = useCombobox({ opened: true });

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

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " && combobox.getSelectedOptionIndex() !== -1) {
      event.preventDefault();
      combobox.clickSelectedOption();
    }
  };

  return (
    <Combobox
      store={combobox}
      classNames={{ options: S.Options, option: S.Option }}
    >
      <div className={S.List}>
        {/* The listbox itself takes focus and drives navigation via
            aria-activedescendant; drop the attributes that only make sense
            on a combobox input. */}
        <Combobox.EventsTarget
          aria-haspopup={undefined}
          aria-controls={undefined}
        >
          <Combobox.Options
            aria-label={t`Time grouping options`}
            aria-multiselectable="true"
            tabIndex={0}
            data-autofocus
            onKeyDown={handleListKeyDown}
          >
            <Combobox.Option
              value={SELECT_ALL_VALUE}
              aria-label={t`Select all`}
              // Mantine rewrites aria-selected to mark the keyboard highlight,
              // so the ticked state goes in aria-checked, here and on the units.
              aria-checked={!isAll && !isNone ? "mixed" : isAll}
              onClick={handleAllToggle}
            >
              <div className={S.Row}>
                <Checkbox
                  className={S.RowCheckbox}
                  variant="stacked"
                  checked={isAll}
                  indeterminate={!isAll && !isNone}
                  readOnly
                  aria-hidden
                  tabIndex={-1}
                />
                <div>{t`Select all`}</div>
              </div>
            </Combobox.Option>
            <Combobox.Group className={S.UnitGroup}>
              {availableUnits.map((unit) => {
                const title = Lib.describeTemporalUnit(unit);
                const isSelected = selectedUnitsSet.has(unit);
                return (
                  <Combobox.Option
                    key={unit}
                    value={unit}
                    aria-label={title}
                    aria-checked={isSelected}
                    onClick={() => handleUnitToggle(unit)}
                  >
                    <div className={S.Row}>
                      <Checkbox
                        className={S.RowCheckbox}
                        checked={isSelected}
                        readOnly
                        aria-hidden
                        tabIndex={-1}
                      />
                      <div>{title}</div>
                    </div>
                  </Combobox.Option>
                );
              })}
            </Combobox.Group>
          </Combobox.Options>
        </Combobox.EventsTarget>
      </div>
    </Combobox>
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
