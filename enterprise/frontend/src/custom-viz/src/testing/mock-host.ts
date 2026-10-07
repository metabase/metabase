/// <reference lib="dom" />
import type { ColumnPredicate, ColumnTypes } from "../types/column-types";
import type { Column, RowValue } from "../types/data";
import { type DateTimeUnit, dateTimeUnits } from "../types/date-time";
import type { FormatValue, FormatValueOptions } from "../types/format";
import type { FontStyle, TextSize } from "../types/measure-text";

import columnPresets from "./column-presets.json";
import hostData from "./host-data.json";

export type ColumnKind = keyof typeof columnPresets;

export type ColorScheme = "light" | "dark";

type ColumnPreset = {
  source: string;
  base_type: string;
  effective_type: string;
  semantic_type: string | null;
  unit?: string;
};

const PRESETS: Record<string, ColumnPreset> = columnPresets;
const PREDICATES: Record<string, string[]> = hostData.predicates;
const COLORS: Record<ColorScheme, Record<string, string>> = hostData.colors;

const NUMBER_OPTIONS: (keyof FormatValueOptions)[] = [
  "number_style",
  "decimals",
  "scale",
  "currency",
  "currency_style",
  "prefix",
  "suffix",
  "compact",
  "number_separators",
];

const isDateTimeUnit = (unit: string | undefined): unit is DateTimeUnit =>
  dateTimeUnits.some((known) => known === unit);

export const getColumnPreset = (
  kind: ColumnKind,
): Omit<Column, "name" | "display_name"> => {
  const { unit, ...preset } = PRESETS[kind];
  return isDateTimeUnit(unit) ? { ...preset, unit } : preset;
};

const matchesPreset = (column: Column, preset: ColumnPreset) =>
  column.base_type === preset.base_type &&
  column.effective_type === preset.effective_type &&
  column.semantic_type === preset.semantic_type &&
  column.unit === preset.unit;

const findPredicates = (column: Column) => {
  const entry = Object.entries(PRESETS).find(([, preset]) =>
    matchesPreset(column, preset),
  );
  if (!entry) {
    throw new Error(
      `Column "${column.name}" was not built with mockColumn, so its type is unknown`,
    );
  }
  return PREDICATES[entry[0]];
};

const predicate =
  (name: string): ColumnPredicate =>
  (column) =>
    column ? findPredicates(column).includes(name) : false;

const columnTypes: ColumnTypes = {
  isDate: predicate("isDate"),
  isNumeric: predicate("isNumeric"),
  isInteger: predicate("isInteger"),
  isBoolean: predicate("isBoolean"),
  isString: predicate("isString"),
  isStringLike: predicate("isStringLike"),
  isSummable: predicate("isSummable"),
  isNumericBaseType: predicate("isNumericBaseType"),
  isDateWithoutTime: predicate("isDateWithoutTime"),
  isNumber: predicate("isNumber"),
  isFloat: predicate("isFloat"),
  isTime: predicate("isTime"),
  isFK: predicate("isFK"),
  isPK: predicate("isPK"),
  isEntityName: predicate("isEntityName"),
  isTitle: predicate("isTitle"),
  isProduct: predicate("isProduct"),
  isSource: predicate("isSource"),
  isAddress: predicate("isAddress"),
  isScore: predicate("isScore"),
  isQuantity: predicate("isQuantity"),
  isCategory: predicate("isCategory"),
  isAny: predicate("isAny"),
  isState: predicate("isState"),
  isCountry: predicate("isCountry"),
  isCoordinate: predicate("isCoordinate"),
  isLatitude: predicate("isLatitude"),
  isLongitude: predicate("isLongitude"),
  isCurrency: predicate("isCurrency"),
  isPercentage: predicate("isPercentage"),
  isID: predicate("isID"),
  isURL: predicate("isURL"),
  isEmail: predicate("isEmail"),
  isAvatarURL: predicate("isAvatarURL"),
  isImageURL: predicate("isImageURL"),
  hasLatitudeAndLongitudeColumns: (cols) =>
    cols.some(predicate("isLatitude")) && cols.some(predicate("isLongitude")),
};

const formatNumber = (value: number, options: FormatValueOptions) => {
  const scaled = value * (options.scale ?? 1);
  const formatted = new Intl.NumberFormat("en-US", {
    style:
      options.number_style === "percent"
        ? "percent"
        : options.number_style === "currency"
          ? "currency"
          : "decimal",
    currency: options.currency ?? "USD",
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: options.decimals,
    maximumFractionDigits: options.decimals,
  }).format(scaled);
  return `${options.prefix ?? ""}${formatted}${options.suffix ?? ""}`;
};

const formatValue: FormatValue = (value: RowValue, options = {}) => {
  const isNumberColumn = options.column
    ? findPredicates(options.column).includes("isNumber")
    : false;
  if (
    !isNumberColumn &&
    NUMBER_OPTIONS.some((key) => options[key] !== undefined)
  ) {
    throw new Error(
      "formatValue ignores number options without a numeric `column`: pass `column`, or format with Intl.NumberFormat",
    );
  }
  if (value === null) {
    return "";
  }
  if (typeof value === "number" && isNumberColumn) {
    return formatNumber(value, options);
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const COLOR_VARIABLE = /var\(\s*--mb-color-([\w-]+)/g;

export const assertKnownColorVariables = (markup: string) => {
  const unknown = Array.from(markup.matchAll(COLOR_VARIABLE))
    .map((match) => match[1])
    .filter((name) => COLORS.light[name] === undefined);
  if (unknown.length > 0) {
    throw new Error(
      `var(--mb-color-${unknown[0]}): not a supported color name; see api-contract.md Colors`,
    );
  }
};

export const createGetColor = (colorScheme: ColorScheme) => (name: string) => {
  const value = COLORS[colorScheme][name];
  if (value === undefined) {
    throw new Error(
      `getColor("${name}"): not a supported color name; write custom colors as literals`,
    );
  }
  return value;
};

export const measureText = (text: string, style: FontStyle): TextSize => {
  const size = Number.parseFloat(String(style.size)) || 14;
  return { width: text.length * size * 0.6, height: size * 1.2 };
};

export const installMockHost = () => {
  Object.assign(window, {
    __METABASE_VIZ_API__: { columnTypes, formatValue },
  });
};
