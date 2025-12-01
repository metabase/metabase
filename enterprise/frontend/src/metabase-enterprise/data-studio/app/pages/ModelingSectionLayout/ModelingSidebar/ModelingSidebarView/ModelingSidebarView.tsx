import { Box, Stack } from "metabase/ui";
import { LibrarySection } from "metabase-enterprise/data-studio/app/pages/ModelingSectionLayout/ModelingSidebar/LibrarySection";
import type {
  Collection,
  CollectionId,
  NativeQuerySnippetId,
} from "metabase-types/api";

import S from "./ModelingSidebarView.module.css";
import { SnippetsSection } from "./SnippetsSection";

interface ModelingSidebarViewProps {
  collections: Collection[];
  selectedCollectionId: CollectionId | undefined;
  selectedSnippetId?: NativeQuerySnippetId;
  isGlossaryActive: boolean;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
}

export function ModelingSidebarView({
  collections,
  selectedCollectionId,
  selectedSnippetId,
  hasDataAccess,
  hasNativeWrite,
}: ModelingSidebarViewProps) {
  return (
    <Box w={320} h="100%" className={S.sidebar} data-testid="modeling-sidebar">
      <Stack gap={0}>
        <Box className={S.section} p="md" data-testid="collections-section">
          <LibrarySection
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            hasDataAccess={hasDataAccess}
            hasNativeWrite={hasNativeWrite}
          />
        </Box>

        {hasNativeWrite && (
          <Box className={S.section} p="md" data-testid="snippets-section">
            <SnippetsSection selectedSnippetId={selectedSnippetId} />
          </Box>
        )}
      </Stack>
    </Box>
  );
}
