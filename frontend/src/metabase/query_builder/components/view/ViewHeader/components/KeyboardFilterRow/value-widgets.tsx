import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import {
  UsStatesMap,
  WorldMap,
} from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/UsStatesMap";
import {
  type ContinentPreset,
  getContinentPresets,
  getCountryName,
  getFlagUrl,
} from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/countries";
import { getStateName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/states";
import { Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./KeyboardFilterRow.module.css";
import type { DraftOperator, SuggestionGroup } from "./types";

const TILES_DROPDOWN_WIDTH = 360;
const STATES_DROPDOWN_WIDTH = 720;
const STATES_MAP_WIDTH = 400;
const COUNTRIES_LIST_WIDTH = 340;
const MIN_WORLD_MAP_WIDTH = 380;
const MAX_WORLD_MAP_WIDTH = 650;
/** The padding and the border of the map panel. */
const MAP_PANEL_INSET = 49;

/** The value of the option that selects all the values, or none. */
export const SELECT_ALL_VALUE = "__prototype_select_all__";

export type ValueAndLabel = [string, string];

export interface ValueWidget {
  groups: SuggestionGroup[];
  header?: ReactNode;
  /** A panel on the right of the options, like a map. */
  aside?: ReactNode;
  isTiles: boolean;
  columns: number;
  dropdownWidth?: number;
}

interface UseValueWidgetOpts {
  column: Lib.ColumnMetadata;
  operator: DraftOperator;
  /** The values of the column, with labels. */
  fieldValues: ValueAndLabel[];
  values: string[];
  /** The share of the rows with each value, when it is known. */
  getShare?: (value: string) => number;
  /** True when the shares are estimates from a sample. */
  isShareEstimate?: boolean;
  /** The widest dropdown that fits in the window. */
  maxDropdownWidth?: number;
  onValuesChange: (values: string[]) => void;
  onToggleValue: (value: string) => void;
}

/**
 * True when the widget of the column shows the share of the rows with each
 * value: the operator options, countries and US states.
 */
export function hasValueShares(
  column: Lib.ColumnMetadata,
  operator: DraftOperator,
) {
  return (
    operator.options != null || Lib.isState(column) || Lib.isCountry(column)
  );
}

/**
 * Prototype: the dropdown under the value input, with the widgets of the
 * filter widgets prototype: tiles for operator options, flags and continent
 * presets for countries, and a map for US states. Other columns get a
 * checkbox list.
 */
export function useValueWidget({
  column,
  operator,
  fieldValues,
  values,
  getShare,
  isShareEstimate = false,
  maxDropdownWidth = Infinity,
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
    // The map grows up to its max width when the window has space for it.
    const worldMapWidth = Math.max(
      MIN_WORLD_MAP_WIDTH,
      Math.min(
        MAX_WORLD_MAP_WIDTH,
        maxDropdownWidth - COUNTRIES_LIST_WIDTH - MAP_PANEL_INSET,
      ),
    );
    return {
      groups: [
        {
          options: [
            ...getSelectAllOptions(operator, countryValues, values),
            ...countryValues.map(([value, label]) => ({
              value,
              label,
              leftSection: (
                <img className={S.flag} src={getFlagUrl(value)} alt="" />
              ),
              isChecked: isChecked(value),
            })),
          ],
        },
      ],
      header: operator.valueKind === "multi" && (
        <ContinentPresets
          values={countryValues.map(([value]) => value)}
          selectedValues={values}
          getShare={getShare}
          isShareEstimate={isShareEstimate}
          onChange={onValuesChange}
        />
      ),
      aside: (
        <WorldMap
          valuesByCode={
            new Map(
              countryValues.map(([value]) => [value.toUpperCase(), value]),
            )
          }
          selectedValues={values}
          width={worldMapWidth}
          getShare={getShare}
          onToggle={onToggleValue}
        />
      ),
      isTiles: false,
      columns: 1,
      dropdownWidth: COUNTRIES_LIST_WIDTH + worldMapWidth + MAP_PANEL_INSET,
    };
  }

  if (stateValues != null) {
    return {
      groups: [
        {
          options: [
            ...getSelectAllOptions(operator, stateValues, values),
            ...stateValues.map(([value, label]) => ({
              value,
              label,
              isChecked: isChecked(value),
            })),
          ],
        },
      ],
      aside: (
        <UsStatesMap
          valuesByCode={
            new Map(stateValues.map(([value]) => [value.toUpperCase(), value]))
          }
          selectedValues={values}
          width={STATES_MAP_WIDTH}
          getShare={getShare}
          onToggle={onToggleValue}
        />
      ),
      isTiles: false,
      columns: 1,
      dropdownWidth: STATES_DROPDOWN_WIDTH,
    };
  }

  return {
    groups: [
      {
        options: [
          ...getSelectAllOptions(operator, fieldValues, values),
          ...fieldValues.map(([value, label]) => ({
            value,
            label,
            isChecked: isChecked(value),
          })),
        ],
      },
    ],
    isTiles: false,
    columns: 1,
  };
}

/**
 * The "Select all" option above a list of values that the user can check
 * many of. It is checked when all the values are checked, and indeterminate
 * when some are.
 */
function getSelectAllOptions(
  operator: DraftOperator,
  fieldValues: ValueAndLabel[],
  selectedValues: string[],
) {
  if (operator.valueKind !== "multi" || fieldValues.length < 2) {
    return [];
  }
  const checkedCount = fieldValues.filter(([value]) =>
    selectedValues.includes(value),
  ).length;
  return [
    {
      value: SELECT_ALL_VALUE,
      label: t`Select all`,
      isChecked: checkedCount === fieldValues.length,
      isIndeterminate: checkedCount > 0 && checkedCount < fieldValues.length,
      isSelectAll: true,
    },
  ];
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
  getShare?: (value: string) => number;
  isShareEstimate: boolean;
  onChange: (values: string[]) => void;
}

function ContinentPresets({
  values,
  selectedValues,
  getShare,
  isShareEstimate,
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
      {presets.map((preset) => {
        const isSelected = isPresetSelected(preset);
        // The share of a continent is the sum of the shares of its countries.
        const share =
          getShare != null
            ? preset.values.reduce((sum, value) => sum + getShare(value), 0)
            : undefined;
        return (
          <button
            key={preset.name}
            className={cx(S.tile, { [S.shareTile]: share != null })}
            style={share != null ? getTileShareStyle(share) : undefined}
            aria-pressed={isSelected}
            onClick={() => handleClick(preset)}
          >
            <Flex align="center" gap="sm" miw={0}>
              {isSelected && <Icon name="check" />}
              <span className={S.optionLabel}>{preset.name}</span>
            </Flex>
            {share != null && (
              <span className={S.tileShare}>
                {formatShare(share, isShareEstimate)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A share as a percent, like "34%", or "~34%" for an estimate. */
export function formatShare(share: number, isEstimate: boolean) {
  const percent = share * 100;
  const label =
    percent > 0 && percent < 0.5 ? "<1%" : `${Math.round(percent)}%`;
  return isEstimate ? `~${label}` : label;
}

/** The fill of a tile, as wide as the share. */
export function getTileShareStyle(share: number): Record<string, string> {
  return { "--tile-share": `${share * 100}%` };
}
