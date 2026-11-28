import { skipToken, useGetCollectionQuery } from "metabase/api";
import {
  isInstanceAnalyticsCollection,
  isInstanceAnalyticsCustomCollection,
} from "metabase/common/collections/utils";
import { getDashboard } from "metabase/dashboard/shell-selectors";
import { getQuestion } from "metabase/query_builder";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

function isUsageAnalyticsCollection(collection: Collection | null | undefined) {
  return (
    collection != null &&
    (isInstanceAnalyticsCollection(collection) ||
      isInstanceAnalyticsCustomCollection(collection))
  );
}

/**
 * PROTOTYPE: whether the current page is a dashboard, question or collection
 * inside Usage analytics, which the app shows inside Monitor.
 */
export function useIsUsageAnalyticsContent(): boolean {
  const { pathname } = useLocation();
  const dashboard = useSelector(getDashboard);
  const question = useSelector(getQuestion);
  const collectionId = Urls.extractCollectionIdFromPath(pathname);
  // The collection page loads this too, so it comes from the cache.
  const { data: collection } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  if (pathname.startsWith("/dashboard/")) {
    return isUsageAnalyticsCollection(dashboard?.collection);
  }
  if (/^\/(question|model|metric)\//.test(pathname)) {
    return isUsageAnalyticsCollection(question?.collection());
  }
  if (collectionId != null) {
    return isUsageAnalyticsCollection(collection);
  }
  return false;
}
