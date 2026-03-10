import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { FieldValue, RowValue } from "metabase-types/api";

import type { Option } from "../SingleSelectListField/types";

/**
 * Returns true when the option matches the filter. If the option has an
 * available content translation, the filter is tested against this translation
 **/
export function optionMatchesFilter(
  option: FieldValue | undefined,
  filter: string,
  translate?: ContentTranslationFunction,
) {
  // If filter has no diacritics (like äéĩøů), let's ignore diacritics in the
  // option
  const ignoreDiacritics = filter === removeDiacritics(filter);

  return option?.some((value) => {
    const stringifiedValue = String(value ?? "");
    const maybeTranslatedValue =
      translate?.(stringifiedValue) || stringifiedValue;
    const normalizedValue = ignoreDiacritics
      ? removeDiacritics(maybeTranslatedValue)
      : maybeTranslatedValue;
    return normalizedValue.toLowerCase().includes(filter);
  });
}

/** To allow a string like Gerät to match a query like 'gera', we remove
 * diacritics from a string */
export const removeDiacritics = (value: string) =>
  value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const getOptionDisplayName = (option: Option | RowValue[]) =>
  String(option.at(-1));

/**
 * Coerces selected values to match option key types via string comparison.
 * This fixes a type mismatch where URL query params are normalized to numbers
 * (e.g. `1`) but static-list option keys remain strings (e.g. `"1"`), causing
 * `Map.has()` / `Set.has()` to miss the match and create synthetic options.
 */
export function normalizeValuesToOptionKeys(
  values: RowValue[],
  options: Option[],
): RowValue[] {
  const optionKeysByString = new Map(
    options.map((option) => [String(option[0]), option[0]]),
  );
  return values.map((value) => {
    const matchingKey = optionKeysByString.get(String(value));
    return matchingKey !== undefined ? matchingKey : value;
  });
}
