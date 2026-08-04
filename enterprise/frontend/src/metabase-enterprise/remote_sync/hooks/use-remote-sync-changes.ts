import { useGetRemoteSyncChangesQuery } from "../../api";

/**
 * Unsaved changes as the settings form needs them: unlike {@link useRemoteSyncDirtyState}
 * this never skips, because read-only mode also depends on the dirty count.
 * TODO: Merge this with useRemoteSyncDirtyState
 */
export const useRemoteSyncChanges = () =>
  useGetRemoteSyncChangesQuery(undefined, {
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });
