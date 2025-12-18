import { t } from "ttag";

import { DataReferenceButton } from "metabase/query_builder/components/view/DataReferenceButton";
import { NativeVariablesButton } from "metabase/query_builder/components/view/NativeVariablesButton";
import { PreviewQueryButton } from "metabase/query_builder/components/view/PreviewQueryButton";
import { SnippetSidebarButton } from "metabase/query_builder/components/view/SnippetSidebarButton";
import type { QueryModalType } from "metabase/query_builder/constants";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

import type { SidebarFeatures } from "../types";

import S from "./NativeQueryEditorActionButtons.module.css";

const ICON_SIZE = 18;

interface NativeQueryEditorActionButtonsProps {
  question: Question;
  features: SidebarFeatures;
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;
  runQuery?: () => void;
  cancelQuery?: () => void;
  toggleDataReference?: () => void;
  toggleSnippetSidebar?: () => void;
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
    toggleDataReference,
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
      gap="lg"
      align="center"
    >
      {PreviewQueryButton.shouldRender({ question }) && (
        <PreviewQueryButton {...props} />
      )}
      {features.dataReference && (
        <DataReferenceButton
          {...props}
          size={ICON_SIZE}
          onClick={toggleDataReference}
        />
      )}
      {features.snippets && showSnippetSidebarButton && (
        <SnippetSidebarButton {...props} size={ICON_SIZE} />
      )}
      {features.variables && (
        <NativeVariablesButton {...props} size={ICON_SIZE} />
      )}
      {showFormatButton && onFormatQuery && (
        <Tooltip label={t`Auto-format`}>
          <Button
            variant="subtle"
            className={S.button}
            aria-label={t`Auto-format`}
            p={0}
            leftSection={<Icon name="format_code" size={ICON_SIZE} />}
            onClick={onFormatQuery}
          />
        </Tooltip>
      )}
    </Flex>
  );
};
