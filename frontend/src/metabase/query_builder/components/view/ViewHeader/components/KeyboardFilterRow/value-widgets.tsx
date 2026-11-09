import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import {
  UsStatesMap,
  WorldMap,
} from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/UsStatesMap";
import { getCountryName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/countries";
import { getStateName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/states";
import * as Lib from "metabase-lib";

import type { DraftOperator, SuggestionGroup } from "./types";

const TILES_DROPDOWN_WIDTH = 360;
/**
 * The size of the dropdowns with a map. The list on the left of the map is
 * 220px wide, and the map gets the rest of the width.
 */
const MAP_DROPDOWN_HEIGHT = 340;
const STATES_DROPDOWN_WIDTH = 680;
const STATES_MAP_WIDTH = 425;
const COUNTRIES_DROPDOWN_WIDTH = 760;
const WORLD_MAP_WIDTH = 525;

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
  /** The height of a dropdown with an aside panel. */
  dropdownHeight?: number;
}

interface UseValueWidgetOpts {
  column: Lib.ColumnMetadata;
  operator: DraftOperator;
  /** The values of the column, with labels. */
  fieldValues: ValueAndLabel[];
  values: string[];
  /** The share of the rows with each value, when it is known. */
  getShare?: (value: string) => number;
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
 * filter widgets prototype: tiles for operator options, and a map for
 * countries and US states. Other columns get a checkbox list.
 */
export function useValueWidget({
  column,
  operator,
  fieldValues,
  values,
  getShare,
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
          options: [
            ...getSelectAllOptions(operator, countryValues, values),
            ...countryValues.map(([value, label]) => ({
              value,
              label,
              isChecked: isChecked(value),
            })),
          ],
        },
      ],
      aside: (
        <WorldMap
          valuesByCode={
            new Map(
              countryValues.map(([value]) => [value.toUpperCase(), value]),
            )
          }
          selectedValues={values}
          width={WORLD_MAP_WIDTH}
          getShare={getShare}
          onToggle={onToggleValue}
        />
      ),
      isTiles: false,
      columns: 1,
      dropdownWidth: COUNTRIES_DROPDOWN_WIDTH,
      dropdownHeight: MAP_DROPDOWN_HEIGHT,
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
      dropdownHeight: MAP_DROPDOWN_HEIGHT,
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

/** A share as a percent, like "34%". */
export function formatShare(share: number) {
  const percent = share * 100;
  return percent > 0 && percent < 0.5 ? "<1%" : `${Math.round(percent)}%`;
}
