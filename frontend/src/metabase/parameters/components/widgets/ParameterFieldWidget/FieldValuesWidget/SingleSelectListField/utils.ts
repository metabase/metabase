export function isValidOptionItem(optionItem: any, filter: string): boolean {
  return String(optionItem).toLowerCase().includes(filter);
}
