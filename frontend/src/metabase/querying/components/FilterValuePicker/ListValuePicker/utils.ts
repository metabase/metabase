import type { SelectItem } from "metabase/ui";

export function searchOptions(
  options: SelectItem[],
  searchText: string,
): SelectItem[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}
