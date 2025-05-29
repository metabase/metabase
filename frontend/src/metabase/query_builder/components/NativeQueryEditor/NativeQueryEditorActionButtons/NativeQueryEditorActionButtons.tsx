import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { PLUGIN_AI_SQL_GENERATION } from "metabase/plugins";
import { canFormatForEngine } from "metabase/query_builder/components/NativeQueryEditor/utils";
import { DataReferenceButton } from "metabase/query_builder/components/view/DataReferenceButton";
import { NativeVariablesButton } from "metabase/query_builder/components/view/NativeVariablesButton";
import { PreviewQueryButton } from "metabase/query_builder/components/view/PreviewQueryButton";
import { SnippetSidebarButton } from "metabase/query_builder/components/view/SnippetSidebarButton";
import type { QueryModalType } from "metabase/query_builder/constants";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

import S from "./NativeQueryEditorActionButtons.module.css";

const ICON_SIZE = 18;

export type Features = {
  dataReference?: boolean;
  variables?: boolean;
  snippets?: boolean;
  promptInput?: boolean;
};

interface NativeQueryEditorActionButtonsProps {
  question: Question;
  nativeEditorSelectedText?: string;
  features: Features;
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;
  isPromptInputVisible?: boolean;
  runQuery?: () => void;
  cancelQuery?: () => void;
  onOpenModal: (modalType: QueryModalType) => void;
  onShowPromptInput: () => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  onFormatQuery: () => void;
  onGenerateQuery: (queryText: string) => void;
}

export const NativeQueryEditorActionButtons = (
  props: NativeQueryEditorActionButtonsProps,
) => {
  const {
    question,
    nativeEditorSelectedText,
    snippetCollections,
    snippets,
    features,
    onFormatQuery,
    onGenerateQuery,
  } = props;

  // hide the snippet sidebar if there aren't any visible snippets/collections
  // and the root collection isn't writable
  const showSnippetSidebarButton = !(
    snippets?.length === 0 &&
    snippetCollections?.length === 1 &&
    !snippetCollections[0].can_write
  );

  const query = question.query();
  const engine = question.database?.()?.engine;
  const canFormatQuery = engine != null && canFormatForEngine(engine);
  const canGenerateQuery =
    engine != null && getEngineNativeType(engine) === "sql";

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
        <DataReferenceButton {...props} size={ICON_SIZE} />
      )}
      {features.snippets && showSnippetSidebarButton && (
        <SnippetSidebarButton {...props} size={ICON_SIZE} />
      )}
      {features.variables && (
        <NativeVariablesButton {...props} size={ICON_SIZE} />
      )}
      {canFormatQuery && (
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
      {canGenerateQuery && (
        <PLUGIN_AI_SQL_GENERATION.GenerateSqlQueryButton
          query={query}
          selectedQueryText={nativeEditorSelectedText}
          onGenerateQuery={onGenerateQuery}
        />
      )}
    </Flex>
  );
};
