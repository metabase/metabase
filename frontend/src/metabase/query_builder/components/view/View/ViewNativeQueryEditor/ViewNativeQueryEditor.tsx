import type { ResizableBoxProps } from "react-resizable";

import { useSelector } from "metabase/lib/redux";
import { useInlineSQLPrompt } from "metabase/metabot/components/MetabotInlineSQLPrompt";
import { NativeQueryEditor } from "metabase/query_builder/components/NativeQueryEditor";
import type {
  SelectionRange,
  SidebarFeatures,
} from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import { getHighlightedNativeQueryLineNumbers } from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  CardId,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

import NativeQueryEditorS from "./ViewNativeQueryEditor.module.css";

interface ViewNativeQueryEditorProps {
  height?: number;
  card?: Card;

  question: Question;
  query: NativeQuery;

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  highlightedLineNumbers?: number[];

  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;

  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;

  readOnly?: boolean;
  canChangeDatabase?: boolean;
  hasTopBar?: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar?: boolean;
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

  editorContext?: "question";

  runQuery: () => void;
  toggleEditor: () => void;
  handleResize: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: SelectionRange[]) => void;
  openDataReferenceAtQuestion: (id: CardId) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  onOpenModal: (modalType: QueryModalType) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  cancelQuery?: () => void;
  closeSnippetModal: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
  availableHeight?: number;
}

export const ViewNativeQueryEditor = (props: ViewNativeQueryEditorProps) => {
  const { question, isNativeEditorOpen, onSetDatabaseId } = props;

  const legacyNativeQuery = question.legacyNativeQuery();
  const highlightedLineNumbers = useSelector(
    getHighlightedNativeQueryLineNumbers,
  );

  const inlineSQLPrompt = useInlineSQLPrompt(question, "qb");

  // Normally, when users open native models,
  // they open an ad-hoc GUI question using the model as a data source
  // (using the `/dataset` endpoint instead of the `/card/:id/query`)
  // However, users without data permission open a real model as they can't use the `/dataset` endpoint
  // So the model is opened as an underlying native question and the query editor becomes visible
  // This check makes it hide the editor in this particular case
  // More details: https://github.com/metabase/metabase/pull/20161
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if ((question.type() === "model" && !isEditable) || !legacyNativeQuery) {
    return null;
  }

  return (
    <Box className={NativeQueryEditorS.NativeQueryEditorContainer}>
      <NativeQueryEditor
        {...props}
        query={legacyNativeQuery}
        highlightedLineNumbers={highlightedLineNumbers}
        isInitiallyOpen={isNativeEditorOpen}
        onSetDatabaseId={onSetDatabaseId}
        extensions={inlineSQLPrompt?.extensions}
        proposedQuestion={inlineSQLPrompt?.proposedQuestion}
        onAcceptProposed={inlineSQLPrompt?.handleAcceptProposed}
        onRejectProposed={inlineSQLPrompt?.handleRejectProposed}
      />
      {inlineSQLPrompt?.portalElement}
    </Box>
  );
};
