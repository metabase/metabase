import type { SelectItemData } from "metabase/ui";

export function searchOptions(
  options: SelectItemData[],
  searchText: string,
): SelectItemData[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}
