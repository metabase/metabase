import type { Option } from "../types";

export function searchOptions(options: Option[], searchText: string): Option[] {
  const searchValue = searchText.toLowerCase();
  return options.filter(option =>
    option.label.toLowerCase().includes(searchValue),
  );
}
