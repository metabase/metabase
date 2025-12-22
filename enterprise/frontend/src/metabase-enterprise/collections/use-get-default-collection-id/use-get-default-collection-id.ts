import { skipToken, useGetCollectionQuery } from "metabase/api";
import {
  type UseGetDefaultCollectionIdResult,
  _useGetDefaultCollectionId as useOSSGetDefaultCollectionId,
} from "metabase/collections/hooks";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import { isInstanceAnalyticsCollection } from "metabase-enterprise/collections/utils";
import type { CollectionId } from "metabase-types/api";

/**
 * if the source collection is in the instance analytics collection, the default save location
 * should be in the custom reports collection
 */
export const useGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
): UseGetDefaultCollectionIdResult => {
  const { data: auditInfo, isLoading: isAuditInfoLoading } =
    useGetAuditInfoQuery(sourceCollectionId ? undefined : skipToken);

  const { data: collectionInfo, isLoading: isCollectionInfoLoading } =
    useGetCollectionQuery(
      sourceCollectionId ? { id: sourceCollectionId } : skipToken,
    );

  const {
    data: customReportsCollectionInfo,
    isLoading: isCustomReportsCollectionInfoLoading,
  } = useGetCollectionQuery(
    auditInfo?.custom_reports ? { id: auditInfo?.custom_reports } : skipToken,
  );

  const isIAcollection = isInstanceAnalyticsCollection(collectionInfo);

  const { defaultCollectionId: initialCollectionId } =
    useOSSGetDefaultCollectionId(sourceCollectionId);

  const isLoading =
    isAuditInfoLoading ||
    isCollectionInfoLoading ||
    isCustomReportsCollectionInfoLoading;

  if (
    isIAcollection &&
    auditInfo?.custom_reports &&
    customReportsCollectionInfo?.can_write
  ) {
    return { defaultCollectionId: auditInfo.custom_reports, isLoading };
  }

  return { defaultCollectionId: initialCollectionId, isLoading };
};
