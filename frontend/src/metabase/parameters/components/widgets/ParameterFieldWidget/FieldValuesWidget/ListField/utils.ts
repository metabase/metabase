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
