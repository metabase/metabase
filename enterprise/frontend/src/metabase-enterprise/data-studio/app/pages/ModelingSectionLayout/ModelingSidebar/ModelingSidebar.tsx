import { useMemo } from "react";

import {
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import type { CollectionId, NativeQuerySnippetId } from "metabase-types/api";

import { ModelingSidebarView } from "./ModelingSidebarView";

type ModelingSidebarProps = {
  selectedCollectionId: CollectionId | undefined;
  selectedSnippetId: NativeQuerySnippetId | undefined;
  isGlossaryActive: boolean;
};

export function ModelingSidebar({
  selectedCollectionId,
  selectedSnippetId,
  isGlossaryActive,
}: ModelingSidebarProps) {
  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });

  const { hasDataAccess, hasNativeWrite } = useMemo(() => {
    const databases = databaseData?.data ?? [];
    return {
      hasDataAccess: getHasDataAccess(databases),
      hasNativeWrite: getHasNativeWrite(databases),
    };
  }, [databaseData]);

  const isLoading = isLoadingDatabases || isLoadingCollections;

  if (isLoading) {
    return null;
  }

  return (
    <ModelingSidebarView
      collections={collections}
      selectedCollectionId={selectedCollectionId}
      selectedSnippetId={selectedSnippetId}
      isGlossaryActive={isGlossaryActive}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
    />
  );
}
