import type { SelectItem } from "metabase/ui";

export function searchItems(
  items: SelectItem[],
  searchText: string,
): SelectItem[] {
  const searchValue = searchText.toLowerCase();
  return items.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}
