import { useSetting } from "metabase/common/hooks";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";

import { REMOTE_SYNC_KEY } from "../constants";

export const useLibraryCollection = () => {
  const isRemoteSyncEnabled = !!useSetting(REMOTE_SYNC_KEY);

  const { data: libraryCollectionData } = useGetLibraryCollectionQuery(
    undefined,
    { skip: !isRemoteSyncEnabled },
  );

  return libraryCollectionData && "name" in libraryCollectionData
    ? libraryCollectionData
    : undefined;
};
