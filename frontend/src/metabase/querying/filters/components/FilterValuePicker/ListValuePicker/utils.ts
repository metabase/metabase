import type { ComboboxItem } from "metabase/ui";

export function searchOptions(
  options: ComboboxItem[],
  searchText: string,
): ComboboxItem[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}
