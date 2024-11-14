import type { RowValue } from "metabase-types/api";

export function isValidOptionItem(
  optionItem: RowValue,
  filter: string,
): boolean {
  return String(optionItem).toLowerCase().includes(filter);
}
