import {
  useGetActionQuery,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDatabaseQuery,
  useGetDocumentQuery,
  useGetSegmentQuery,
  useGetTableQuery,
  useListMentionsQuery,
} from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import type { SuggestionModel } from "../shared/types";

function assertUnreachable(value: never) {
  console.warn(`Unhandled model type: ${value}`);
}

export const useEntityData = (
  entityId: number | null,
  model: SuggestionModel | null,
) => {
  const isCard = model && ["card", "dataset", "metric"].includes(model);
  const cardQuery = useGetCardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || !isCard },
  );

  const dashboardQuery = useGetDashboardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || model !== "dashboard" },
  );

  const collectionQuery = useGetCollectionQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || model !== "collection" },
  );

  const tableQuery = useGetTableQuery(
    { id: entityId! },
    { skip: !entityId || model !== "table" },
  );

  const databaseQuery = useGetDatabaseQuery(
    { id: entityId! },
    { skip: !entityId || model !== "database" },
  );

  const documentQuery = useGetDocumentQuery(
    {
      id: entityId!,
    },
    {
      skip: !entityId || model !== "document",
    },
  );

  const transformQuery = PLUGIN_TRANSFORMS.useGetTransformQuery(entityId!, {
    skip: !PLUGIN_TRANSFORMS.isEnabled || !entityId || model !== "transform",
  });

  const actionQuery = useGetActionQuery(
    { id: entityId! },
    { skip: !entityId || model !== "action" },
  );

  const segmentQuery = useGetSegmentQuery(entityId!, {
    skip: !entityId || model !== "segment",
  });

  const usersQuery = useListMentionsQuery(undefined, {
    skip: !entityId || model !== "user",
  });

  // Determine which query is active and return its state
  switch (model) {
    case "card":
    case "dataset":
    case "metric":
      return {
        entity: cardQuery.data,
        isLoading: cardQuery.isLoading,
        error: cardQuery.error,
      };
    case "dashboard":
      return {
        entity: dashboardQuery.data,
        isLoading: dashboardQuery.isLoading,
        error: dashboardQuery.error,
      };
    case "collection":
      return {
        entity: collectionQuery.data,
        isLoading: collectionQuery.isLoading,
        error: collectionQuery.error,
      };
    case "table":
      return {
        entity: tableQuery.data,
        isLoading: tableQuery.isLoading,
        error: tableQuery.error,
      };
    case "database":
      return {
        entity: databaseQuery.data,
        isLoading: databaseQuery.isLoading,
        error: databaseQuery.error,
      };
    case "document":
      return {
        entity: documentQuery.data,
        isLoading: documentQuery.isLoading,
        error: documentQuery.error,
      };
    case "transform":
      return {
        entity: transformQuery.data,
        isLoading: transformQuery.isLoading,
        error: transformQuery.error,
      };
    case "action":
      return {
        entity: actionQuery.data,
        isLoading: actionQuery.isLoading,
        error: actionQuery.error,
      };
    case "segment":
      return {
        entity: segmentQuery.data,
        isLoading: segmentQuery.isLoading,
        error: segmentQuery.error,
      };
    case "user": {
      const user = usersQuery.data?.data.find((user) => user.id === entityId);

      return {
        entity: user ? { ...user, name: user.common_name } : null,
        isLoading: usersQuery.isLoading,
        error: usersQuery.error,
      };
    }
    case "indexed-entity":
    case "measure":
    case "exploration":
    case null:
      return { entity: null, isLoading: false, error: null };
    default:
      assertUnreachable(model);
      return { entity: null, isLoading: false, error: null };
  }
};
