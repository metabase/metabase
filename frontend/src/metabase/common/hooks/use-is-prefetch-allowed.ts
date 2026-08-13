import { useNetwork } from "@mantine/hooks";

/**
 * Returns false when the user has explicitly opted into Data Saver mode
 * (`navigator.connection.saveData`)
 */
export function useIsPrefetchAllowed(): boolean {
  const { saveData } = useNetwork();
  return saveData !== true;
}
