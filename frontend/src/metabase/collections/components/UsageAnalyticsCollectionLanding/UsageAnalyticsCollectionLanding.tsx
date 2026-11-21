import { useListCollectionsTreeQuery } from "metabase/api";
import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import { CollectionContent } from "../CollectionContent";

/**
 * PROTOTYPE: the Usage analytics collection page, for showing inside Monitor.
 * Not found when the user can't see the collection.
 */
export function UsageAnalyticsCollectionLanding() {
  // Same args as the main nav's tree, so this reuses its cached response.
  const {
    data: collections,
    isLoading,
    error,
  } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
    "include-library": true,
  });
  const usageAnalyticsCollection = collections?.find(
    isInstanceAnalyticsCollection,
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }
  if (!usageAnalyticsCollection) {
    return <NotFound />;
  }
  return <CollectionContent collectionId={usageAnalyticsCollection.id} />;
}
