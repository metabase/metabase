import { useListCollectionsTreeQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
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
  const { data: collections = [], isLoading } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
    "include-library": true,
  });
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

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
