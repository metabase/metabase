import type { ReactNode } from "react";
import { t } from "ttag";

import { DataReferenceButton } from "metabase/querying/components/NativeQueryEditor/DataReferenceButton";
import { NativeVariablesButton } from "metabase/querying/components/NativeQueryEditor/NativeVariablesButton";
import { PreviewQueryButton } from "metabase/querying/components/NativeQueryEditor/PreviewQueryButton";
import { SnippetSidebarButton } from "metabase/querying/components/NativeQueryEditor/SnippetSidebarButton";
import type { QueryModalType } from "metabase/querying/constants";
import type { SidebarFeatures } from "metabase/querying/editor/types";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

import S from "./NativeQueryEditorActionButtons.module.css";

export const NATIVE_EDITOR_ICON_SIZE = 18;

interface NativeQueryEditorActionButtonsProps {
  question: Question;
  features: SidebarFeatures;
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  promptButton?: ReactNode;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;
  runQuery?: () => void;
  cancelQuery?: () => void;
  toggleDataReference?: () => void;
  toggleSnippetSidebar?: () => void;
  toggleTemplateTagsEditor?: () => void;
  onOpenModal?: (modalType: QueryModalType) => void;
  onFormatQuery?: () => void;
}

export const NativeQueryEditorActionButtons = (
  props: NativeQueryEditorActionButtonsProps,
) => {
  const {
    question,
    snippetCollections,
    snippets,
    features,
    promptButton,
    toggleDataReference,
    toggleTemplateTagsEditor,
    onFormatQuery,
  } = props;

  // hide the snippet sidebar if there aren't any visible snippets/collections
  // and the root collection isn't writable
  const showSnippetSidebarButton = !(
    snippets?.length === 0 &&
    snippetCollections?.length === 1 &&
    !snippetCollections[0].can_write
  );

  // Default to true if not explicitly set to false
  const showFormatButton = features.formatQuery !== false;

  return (
    <Flex
      component="aside"
      data-testid="native-query-editor-action-buttons"
      gap="xl"
      align="center"
    >
      {promptButton}
      {PreviewQueryButton.shouldRender({ question }) && (
        <PreviewQueryButton {...props} />
      )}
      {features.dataReference && (
        <DataReferenceButton
          {...props}
          size={NATIVE_EDITOR_ICON_SIZE}
          onClick={toggleDataReference}
        />
      )}
      {features.snippets && showSnippetSidebarButton && (
        <SnippetSidebarButton {...props} size={NATIVE_EDITOR_ICON_SIZE} />
      )}
      {features.variables && (
        <NativeVariablesButton
          {...props}
          size={NATIVE_EDITOR_ICON_SIZE}
          onClick={toggleTemplateTagsEditor}
        />
      )}
      {showFormatButton && onFormatQuery && (
        <Tooltip label={t`Auto-format`}>
          {/* TODO: replace with ActionIcon (GDGT-2457) */}
          <Button
            variant="transparent"
            size="compact-md"
            className={S.button}
            aria-label={t`Auto-format`}
            leftSection={
              <Icon
                c="icon-primary"
                name="format_code"
                size={NATIVE_EDITOR_ICON_SIZE}
              />
            }
            onClick={onFormatQuery}
          />
        </Tooltip>
      )}
    </Flex>
  );
};
