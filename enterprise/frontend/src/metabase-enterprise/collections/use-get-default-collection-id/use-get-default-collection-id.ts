import { skipToken, useGetCollectionQuery } from "metabase/api";
import { useOSSGetDefaultCollectionId } from "metabase/collections/hooks";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import { isInstanceAnalyticsCollection } from "metabase-enterprise/collections/utils";
import type { CollectionId } from "metabase-types/api";

/**
 * if the source collection is in the instance analytics collection, the default save location
 * should be in the custom reports collection
 */
export const useGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
): CollectionId | null => {
  const { data: auditInfo } = useGetAuditInfoQuery(
    sourceCollectionId ? undefined : skipToken,
  );

  const { data: collectionInfo } = useGetCollectionQuery(
    sourceCollectionId ? { id: sourceCollectionId } : skipToken,
  );

  const { data: customReportsCollectionInfo } = useGetCollectionQuery(
    auditInfo?.custom_reports ? { id: auditInfo?.custom_reports } : skipToken,
  );

  const isIAcollection = isInstanceAnalyticsCollection(collectionInfo);

  const initialCollectionId = useOSSGetDefaultCollectionId(sourceCollectionId);

  if (
    isIAcollection &&
    auditInfo?.custom_reports &&
    customReportsCollectionInfo?.can_write
  ) {
    return auditInfo.custom_reports;
  }

  return initialCollectionId;
};
