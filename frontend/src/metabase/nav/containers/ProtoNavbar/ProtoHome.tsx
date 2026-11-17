import { useListCollectionItemsQuery } from "metabase/api";
import { Navigate } from "metabase/router";
import { Center, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useSyncedCollections } from "./sections/HomeSection";

// Prototype landing page: open the first collection synced from the Git
// repository (the Home tab). Without synced content, fall back to the first
// dashboard in "Our analytics", then the collection itself.
export function ProtoHome() {
  const { syncedTree, isLoading: isLoadingSynced } = useSyncedCollections();
  const { data, isLoading } = useListCollectionItemsQuery({
    id: "root",
    models: ["dashboard"],
    limit: 1,
  });

  if (isLoading || isLoadingSynced) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  const firstSyncedCollection = syncedTree[0];
  const firstDashboard = data?.data?.[0];
  const target = firstSyncedCollection
    ? Urls.collection(firstSyncedCollection)
    : firstDashboard
      ? `/dashboard/${firstDashboard.id}`
      : "/collection/root";

  return <Navigate to={target} replace />;
}
