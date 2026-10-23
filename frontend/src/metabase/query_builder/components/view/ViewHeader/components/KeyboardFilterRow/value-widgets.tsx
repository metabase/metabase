import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { UsStatesMap } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/UsStatesMap";
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

const MAX_TILE_OPTIONS = 8;
const WIDE_DROPDOWN_WIDTH = 400;
const TILES_DROPDOWN_WIDTH = 360;
const STATES_DROPDOWN_WIDTH = 720;
const STATES_MAP_WIDTH = 400;

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
  /** The column lists all its values, so the list does not change on search. */
  isListed: boolean;
  values: string[];
  /** The share of the rows with each value, when it is known. */
  getShare?: (value: string) => number;
  /** True when the shares are estimates from a sample. */
  isShareEstimate?: boolean;
  onValuesChange: (values: string[]) => void;
  onToggleValue: (value: string) => void;
}

/**
 * True when the widget of the column shows the share of the rows with each
 * value: tiles and the US states map.
 */
export function hasValueShares(
  column: Lib.ColumnMetadata,
  operator: DraftOperator,
  fieldValues: ValueAndLabel[],
  isListed: boolean,
) {
  return (
    operator.options != null ||
    Lib.isState(column) ||
    Lib.isCountry(column) ||
    (isListed &&
      fieldValues.length > 0 &&
      fieldValues.length <= MAX_TILE_OPTIONS)
  );
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
  getShare,
  isShareEstimate = false,
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
          getShare={getShare}
          isShareEstimate={isShareEstimate}
          onChange={onValuesChange}
        />
      ),
      isTiles: false,
      columns: 1,
      dropdownWidth: WIDE_DROPDOWN_WIDTH,
    };
  }

  if (stateValues != null) {
    const isMulti = operator.valueKind === "multi";
    const isAllChecked = stateValues.every(([value]) => isChecked(value));
    return {
      groups: [
        {
          options: [
            ...(isMulti
              ? [
                  {
                    value: SELECT_ALL_VALUE,
                    label: t`Select all`,
                    isChecked: isAllChecked,
                  },
                ]
              : []),
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
