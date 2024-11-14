import type { FieldValue } from "metabase-types/api";

export function isValidOptionItem(
  optionItem: FieldValue,
  filter: string,
): boolean {
  return String(optionItem).toLowerCase().includes(filter);
}
