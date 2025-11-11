import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import * as Urls from "metabase/lib/urls";
import { Box, Stack } from "metabase/ui";

import { ModelingSidebarSection } from "../ModelingSidebarSection";

import { CollectionsSection } from "./CollectionsSection";
import S from "./ModelingSidebarView.module.css";
import { SnippetsSection } from "./SnippetsSection";

interface ModelingSidebarViewProps {
  collections: ITreeNodeItem[];
  selectedCollectionId: string | number | undefined;
  selectedSnippetId?: number;
  isGlossaryActive: boolean;
  isSegmentsActive: boolean;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
}

export function ModelingSidebarView({
  collections,
  selectedCollectionId,
  selectedSnippetId,
  isGlossaryActive,
  isSegmentsActive,
  hasDataAccess,
  hasNativeWrite,
}: ModelingSidebarViewProps) {
  return (
    <Box w={320} h="100%" bg="bg-white" className={S.sidebar}>
      <Stack gap={0}>
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

        <Box className={S.section} p="md">
          <ModelingSidebarSection
            icon="pie"
            title={t`Segments`}
            to={Urls.dataStudioSegments()}
            isActive={isSegmentsActive}
          />
        </Box>

        <Box className={S.section} p="md">
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
