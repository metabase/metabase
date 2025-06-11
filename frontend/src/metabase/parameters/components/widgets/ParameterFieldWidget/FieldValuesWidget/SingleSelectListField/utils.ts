export function optionItemEqualsFilter(
  optionItem: any,
  filter: string,
): boolean {
  return String(optionItem) === filter;
}

export function optionItemContainsFilter(
  optionItem: any,
  filter: string,
): boolean {
  return String(optionItem).toLowerCase().includes(filter);
}
