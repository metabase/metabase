import { useNetwork } from "@mantine/hooks";

/**
 * Returns false when the user has explicitly opted into Data Saver mode
 * (`navigator.connection.saveData`). Prefetching off-screen content
 * defeats the purpose of that signal. Defaults to true when the Network
 * Information API is unavailable (`saveData` is then `undefined`).
 */
export function useIsPrefetchAllowed(): boolean {
  const { saveData } = useNetwork();
  return saveData !== true;
}
