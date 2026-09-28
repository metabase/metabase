import {
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDatabaseQuery,
  useGetDocumentQuery,
  useGetTableQuery,
  useGetTransformQuery,
} from "metabase/api";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import type { EntityDataResult } from "metabase/rich_text_editing/tiptap/EditorHost";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";

/**
 * Resolves the models metabot can link: the prompt input's suggestion models
 * and the entities a metabase:// link in an answer can name.
 * Any other model resolves to nothing, and the link renders its stored label.
 */
export const useEntityData = (
  entityId: number | null,
  model: SuggestionModel | null,
): EntityDataResult => {
  const isCard = model != null && ["card", "dataset", "metric"].includes(model);

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
    { id: entityId! },
    { skip: !entityId || model !== "document" },
  );

  const transformQuery = useGetTransformQuery(entityId!, {
    skip: !PLUGIN_TRANSFORMS.isEnabled || !entityId || model !== "transform",
  });

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
    default:
      return { entity: null, isLoading: false, error: null };
  }
};
