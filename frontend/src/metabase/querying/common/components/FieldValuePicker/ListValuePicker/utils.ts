import type { ComboboxItem } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import { getFieldOptions } from "../../../utils";

export function searchOptions(
  options: ComboboxItem[],
  searchText: string,
): ComboboxItem[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}

function getSelectedOptions(selectedValues: string[]) {
  return selectedValues.map((value) => ({
    value,
  }));
}

export function getEffectiveOptions(
  fieldValues: FieldValue[],
  selectedValues: string[],
  elevatedValues: string[] = [],
): ComboboxItem[] {
  const options: { label?: string; value: string }[] = [
    ...getSelectedOptions(elevatedValues),
    ...getFieldOptions(fieldValues),
    ...getSelectedOptions(selectedValues),
  ];

  const mapping = options.reduce((map: Map<string, string>, option) => {
    if (option.label) {
      map.set(option.value, option.label);
    } else if (!map.has(option.value)) {
      map.set(option.value, option.value);
    }
    return map;
  }, new Map<string, string>());

  return [...mapping.entries()].map(([value, label]) => ({ value, label }));
}
