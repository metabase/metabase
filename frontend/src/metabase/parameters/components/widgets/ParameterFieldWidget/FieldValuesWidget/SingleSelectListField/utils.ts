export function optionItemEqualsFilter(
  optionItem: any,
  filter: string,
): boolean {
  return String(optionItem) === filter;
}
