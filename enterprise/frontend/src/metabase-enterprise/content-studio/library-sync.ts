import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";

type LibrarySyncState = {
  isLibrarySynced: boolean;
  isLoading: boolean;
};

type LibrarySyncStateOptions = {
  skip?: boolean;
};

/**
 * Snippets ride along with the Library: on the main branch they are only part
 * of remote sync while the Library collection itself is synced.
 */
export function useLibrarySyncState({
  skip = false,
}: LibrarySyncStateOptions = {}): LibrarySyncState {
  const { data, isLoading } = useGetLibraryCollectionQuery(undefined, { skip });
  const library = data != null && "name" in data ? data : undefined;

  return {
    isLibrarySynced: library?.is_remote_synced ?? false,
    isLoading,
  };
}
