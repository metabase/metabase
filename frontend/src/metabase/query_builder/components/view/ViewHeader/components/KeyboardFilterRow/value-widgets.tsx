import type { ReactNode } from "react";
import { useMemo } from "react";

import { UsStatesMap } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/UsStatesMap";
import {
  type ContinentPreset,
  getContinentPresets,
  getCountryName,
  getFlagUrl,
} from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/countries";
import { getStateName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/states";
import * as Lib from "metabase-lib";

import S from "./KeyboardFilterRow.module.css";
import type { DraftOperator, SuggestionGroup } from "./types";

const MAX_TILE_OPTIONS = 8;
const WIDE_DROPDOWN_WIDTH = 400;
const TILES_DROPDOWN_WIDTH = 320;

export type ValueAndLabel = [string, string];

export interface ValueWidget {
  groups: SuggestionGroup[];
  header?: ReactNode;
  isTiles: boolean;
  columns: number;
  dropdownWidth?: number;
}

interface UseValueWidgetOpts {
  column: Lib.ColumnMetadata;
  operator: DraftOperator;
  /** The values of the column, with labels. */
  fieldValues: ValueAndLabel[];
  /** The column lists all its values, so the list does not change on search. */
  isListed: boolean;
  values: string[];
  onValuesChange: (values: string[]) => void;
  onToggleValue: (value: string) => void;
}

/**
 * Prototype: the dropdown under the value input, with the widgets of the
 * filter widgets prototype: tiles for short lists, flags and continent
 * presets for countries, and a map for US states.
 */
export function useValueWidget({
  column,
  operator,
  fieldValues,
  isListed,
  values,
  onValuesChange,
  onToggleValue,
}: UseValueWidgetOpts): ValueWidget {
  const isCountry = Lib.isCountry(column);
  const isState = Lib.isState(column);
  const countryValues = useMemo(
    () => (isCountry ? getNamedValues(fieldValues, getCountryName) : null),
    [isCountry, fieldValues],
  );
  const stateValues = useMemo(
    () => (isState ? getNamedValues(fieldValues, getStateName) : null),
    [isState, fieldValues],
  );

  const isChecked = (value: string) => values.includes(value);

  if (operator.options != null) {
    return {
      groups: [
        {
          options: operator.options.map((option) => ({
            ...option,
            isChecked: isChecked(option.value),
          })),
        },
      ],
      isTiles: true,
      columns: 2,
      dropdownWidth: TILES_DROPDOWN_WIDTH,
    };
  }

  if (countryValues != null) {
    return {
      groups: [
        {
          options: countryValues.map(([value, label]) => ({
            value,
            label,
            leftSection: (
              <img className={S.flag} src={getFlagUrl(value)} alt="" />
            ),
            isChecked: isChecked(value),
          })),
        },
      ],
      header: operator.valueKind === "multi" && (
        <ContinentPresets
          values={countryValues.map(([value]) => value)}
          selectedValues={values}
          onChange={onValuesChange}
        />
      ),
      isTiles: false,
      columns: 1,
      dropdownWidth: WIDE_DROPDOWN_WIDTH,
    };
  }

  if (stateValues != null) {
    return {
      groups: [
        {
          options: stateValues.map(([value, label]) => ({
            value,
            label,
            description: value.toUpperCase(),
            isChecked: isChecked(value),
          })),
        },
      ],
      header: (
        <UsStatesMap
          valuesByCode={
            new Map(stateValues.map(([value]) => [value.toUpperCase(), value]))
          }
          selectedValues={values}
          onToggle={onToggleValue}
        />
      ),
      isTiles: false,
      columns: 2,
      dropdownWidth: WIDE_DROPDOWN_WIDTH,
    };
  }

  const isTiles =
    isListed &&
    fieldValues.length > 0 &&
    fieldValues.length <= MAX_TILE_OPTIONS;
  return {
    groups: [
      {
        options: fieldValues.map(([value, label]) => ({
          value,
          label,
          isChecked: isChecked(value),
        })),
      },
    ],
    isTiles,
    columns: isTiles ? 2 : 1,
    dropdownWidth: isTiles ? TILES_DROPDOWN_WIDTH : undefined,
  };
}

/**
 * Values with names as labels, sorted by name, when all the values have a
 * name. Otherwise null.
 */
function getNamedValues(
  fieldValues: ValueAndLabel[],
  getName: (value: string) => string | null,
): ValueAndLabel[] | null {
  const namedValues: ValueAndLabel[] = [];
  for (const [value] of fieldValues) {
    const name = getName(value);
    if (name == null) {
      return null;
    }
    namedValues.push([value, name]);
  }
  return namedValues.length > 0
    ? namedValues.sort(([, a], [, b]) => a.localeCompare(b))
    : null;
}

interface ContinentPresetsProps {
  values: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}

function ContinentPresets({
  values,
  selectedValues,
  onChange,
}: ContinentPresetsProps) {
  const presets = useMemo(() => getContinentPresets(values), [values]);
  const selectedValuesSet = new Set(selectedValues);
  const isPresetSelected = (preset: ContinentPreset) =>
    preset.values.every((value) => selectedValuesSet.has(value));

  // A preset adds its countries. When all of them are selected, it removes
  // them.
  const handleClick = (preset: ContinentPreset) => {
    const isSelected = isPresetSelected(preset);
    const newValuesSet = new Set(selectedValues);
    preset.values.forEach((value) =>
      isSelected ? newValuesSet.delete(value) : newValuesSet.add(value),
    );
    onChange(Array.from(newValuesSet));
  };

  if (presets.length === 0) {
    return null;
  }

  return (
    <div className={S.presets}>
      {presets.map((preset) => (
        <button
          key={preset.name}
          className={S.tile}
          aria-pressed={isPresetSelected(preset)}
          onClick={() => handleClick(preset)}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}
