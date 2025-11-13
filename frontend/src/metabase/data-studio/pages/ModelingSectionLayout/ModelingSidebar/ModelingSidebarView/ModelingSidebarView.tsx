import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  NativeQuerySnippetId,
} from "metabase-types/api";

import { ModelingSidebarSection } from "../ModelingSidebarSection";

import { CollectionsSection } from "./CollectionsSection";
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
  isGlossaryActive,
  hasDataAccess,
  hasNativeWrite,
}: ModelingSidebarViewProps) {
  return (
    <Box w={320} h="100%" bg="bg-white" className={S.sidebar}>
      <Stack gap={0}>
        {PLUGIN_LIBRARY.isEnabled && (
          <Box className={S.section} p="md">
            <PLUGIN_LIBRARY.LibrarySection
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              hasDataAccess={hasDataAccess}
              hasNativeWrite={hasNativeWrite}
            />
          </Box>
        )}

        <Box className={S.section} p="md">
          <CollectionsSection
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            hasDataAccess={hasDataAccess}
            hasNativeWrite={hasNativeWrite}
          />
        </Box>

        {hasNativeWrite && (
          <Box className={S.section} p="md">
            <SnippetsSection selectedSnippetId={selectedSnippetId} />
          </Box>
        )}

        <Box p="md">
          <ModelingSidebarSection
            icon="book_open"
            title={t`Glossary`}
            to={Urls.dataStudioGlossary()}
            isActive={isGlossaryActive}
          />
        </Box>
      </Stack>
    </Box>
  );
}
