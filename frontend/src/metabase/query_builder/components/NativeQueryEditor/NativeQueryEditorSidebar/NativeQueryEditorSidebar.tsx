import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { isMac } from "metabase/lib/browser";
import { canFormatForEngine } from "metabase/query_builder/components/NativeQueryEditor/utils";
import { DataReferenceButton } from "metabase/query_builder/components/view/DataReferenceButton";
import { NativeVariablesButton } from "metabase/query_builder/components/view/NativeVariablesButton";
import { PreviewQueryButton } from "metabase/query_builder/components/view/PreviewQueryButton";
import { SnippetSidebarButton } from "metabase/query_builder/components/view/SnippetSidebarButton";
import type Question from "metabase-lib/v1/Question";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

import {
  Container,
  RunButtonWithTooltipStyled,
  SidebarButton,
} from "./NativeQueryEditorSidebar.styled";

const ICON_SIZE = 18;

export type Features = {
  dataReference?: boolean;
  variables?: boolean;
  snippets?: boolean;
  promptInput?: boolean;
};

interface NativeQueryEditorSidebarProps {
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
  canUsePromptInput?: boolean;
  runQuery?: () => void;
  cancelQuery?: () => void;
  onOpenModal: (modalType: string) => void;
  onShowPromptInput: () => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  onFormatQuery: () => void;
}

export const NativeQueryEditorSidebar = (
  props: NativeQueryEditorSidebarProps,
) => {
  const {
    question,
    cancelQuery,
    isResultDirty,
    isRunnable,
    isRunning,
    isPromptInputVisible,
    nativeEditorSelectedText,
    runQuery,
    snippetCollections,
    snippets,
    features,
    onShowPromptInput,
    canUsePromptInput,
    onFormatQuery,
  } = props;

  // hide the snippet sidebar if there aren't any visible snippets/collections
  // and the root collection isn't writable
  const showSnippetSidebarButton = !(
    snippets?.length === 0 &&
    snippetCollections?.length === 1 &&
    !snippetCollections[0].can_write
  );

  const getTooltip = () => {
    const command = nativeEditorSelectedText
      ? t`Run selected text`
      : t`Run query`;

    const shortcut = isMac() ? t`(⌘ + enter)` : t`(Ctrl + enter)`;

    return command + " " + shortcut;
  };

  const canRunQuery = runQuery && cancelQuery;

  const engine = question.database?.()?.engine;
  const canFormatQuery = engine != null && canFormatForEngine(engine);

  return (
    <Container data-testid="native-query-editor-sidebar">
      {canFormatQuery && (
        <Tooltip tooltip={t`Format query`}>
          <SidebarButton
            aria-label={t`Format query`}
            onClick={onFormatQuery}
            icon="document"
            iconSize={20}
            onlyIcon
          />
        </Tooltip>
      )}
      {canUsePromptInput && features.promptInput && !isPromptInputVisible ? (
        <Tooltip tooltip={t`Ask a question`}>
          <SidebarButton
            aria-label={t`Ask a question`}
            onClick={onShowPromptInput}
            icon="insight"
            iconSize={20}
            onlyIcon
          />
        </Tooltip>
      ) : null}
      {features.dataReference ? (
        <DataReferenceButton {...props} size={ICON_SIZE} className={CS.mt3} />
      ) : null}
      {features.variables ? (
        <NativeVariablesButton {...props} size={ICON_SIZE} className={CS.mt3} />
      ) : null}
      {features.snippets && showSnippetSidebarButton ? (
        <SnippetSidebarButton {...props} size={ICON_SIZE} className={CS.mt3} />
      ) : null}
      {PreviewQueryButton.shouldRender({ question }) && (
        <PreviewQueryButton {...props} />
      )}
      {!!canRunQuery && (
        <RunButtonWithTooltipStyled
          disabled={!isRunnable}
          isRunning={isRunning}
          isDirty={isResultDirty}
          onRun={runQuery}
          onCancel={cancelQuery}
          compact
          getTooltip={getTooltip}
        />
      )}
    </Container>
  );
};
