export function useReleaseFlag(toggleId: string) {
  if (window.localStorage.getItem(toggleId)) {
    return true;
  }
  return false;
}
