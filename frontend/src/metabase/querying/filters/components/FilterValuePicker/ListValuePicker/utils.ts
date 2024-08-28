import type { SelectOption } from "metabase/ui";

export function searchOptions(
  options: SelectOption[],
  searchText: string,
): SelectOption[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(
    ({ label }) => label != null && label.toLowerCase().includes(searchValue),
  );
}
