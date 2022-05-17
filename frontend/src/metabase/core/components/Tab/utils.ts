export function getTabId<T>(idPrefix: string, value: T): string {
  return `${idPrefix}-T-${value}`;
}

export function getTabPanelId<T>(idPrefix: string, value: T): string {
  return `${idPrefix}-P-${value}`;
}
