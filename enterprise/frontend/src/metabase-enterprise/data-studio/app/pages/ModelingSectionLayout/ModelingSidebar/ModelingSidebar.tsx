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
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

  return (
    <ModelingSidebarView
      selectedCollectionId={selectedCollectionId}
      selectedSnippetId={selectedSnippetId}
      isGlossaryActive={isGlossaryActive}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
    />
  );
}
