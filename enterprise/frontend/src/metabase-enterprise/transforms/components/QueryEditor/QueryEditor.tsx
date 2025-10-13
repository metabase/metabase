import { useHotkeys, useToggle } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Loader, Modal, Stack } from "metabase/ui";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";
import type Question from "metabase-lib/v1/Question";
import type {
  NativeQuerySnippet,
  QueryTransformSource,
  Transform,
} from "metabase-types/api";

import { useQueryMetadata } from "../../hooks/use-query-metadata";
import type { TransformEditorValue } from "../../hooks/use-transform-editor";

import { EditorBody } from "./EditorBody";
import { EditorHeader } from "./EditorHeader";
import { EditorValidationCard } from "./EditorValidationCard";
import S from "./QueryEditor.module.css";
import { getValidationResult, useSelectedText } from "./utils";

type QueryEditorProps = {
  transform?: Transform | undefined;
  initialSource: QueryTransformSource;
  proposedSource?: QueryTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (source: QueryTransformSource) => void;
  onChange?: (source: QueryTransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: QueryTransformSource) => void;
  transformEditor: TransformEditorValue;
};

export function QueryEditor({
  transform,
  proposedSource,
  isNew = true,
  isSaving = false,
  onSave,
  onChange,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
  transformEditor,
}: QueryEditorProps) {
  const {
    question,
    proposedQuestion,
    isQueryDirty,
    setQuestion,
    isRunnable,
    isRunning,
    isResultDirty,
    isNative,
    runQuery,
    cancelQuery,
  } = transformEditor;

  const { isInitiallyLoaded } = useQueryMetadata(question);
  const [isPreviewQueryModalOpen, togglePreviewQueryModal] = useToggle();
  const validationResult = getValidationResult(question.query());

  const source = useMemo(() => {
    const query = proposedSource?.query ?? question.datasetQuery();
    return { type: "query" as const, query };
  }, [proposedSource, question]);

  useRegisterMetabotTransformContext(transform, source);

  const handleChange = async (newQuestion: Question) => {
    setQuestion(newQuestion);
    onChange?.({ type: "query", query: newQuestion.datasetQuery() });
  };

  const handleSave = () => {
    onSave({
      type: "query",
      query: proposedQuestion?.datasetQuery() ?? question.datasetQuery(),
    });
  };

  const handleCmdEnter = () => {
    if (isRunning) {
      cancelQuery();
    } else if (isRunnable) {
      runQuery();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const handleOpenModal = (type: QueryModalType) => {
    if (type === "preview-query") {
      togglePreviewQueryModal(true);
    }
  };

  const [selectionRange, setSelectionRange] = useState<SelectionRange[]>([]);
  const selectedText = useSelectedText(question, selectionRange);

  const [modalSnippet, setModalSnippet] = useState<NativeQuerySnippet | null>(
    null,
  );

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  const loadingQuestion = !isNew && !question?._card?.dataset_query?.database;

  if (!isInitiallyLoaded || isLoading || loadingQuestion) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <>
      <Stack
        className={S.root}
        pos="relative"
        w="100%"
        h="100%"
        data-testid="transform-query-editor"
        gap={0}
      >
        <EditorHeader
          validationResult={validationResult}
          name={transform?.name}
          isNew={isNew}
          isSaving={isSaving}
          hasProposedQuery={!!proposedSource}
          isQueryDirty={isQueryDirty}
          onSave={handleSave}
          onCancel={onCancel}
        />
        <EditorBody
          question={question}
          proposedQuestion={proposedQuestion}
          isNative={isNative}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isResultDirty={isResultDirty}
          isShowingDataReference={false}
          isShowingSnippetSidebar={false}
          onChange={handleChange}
          onRunQuery={runQuery}
          onCancelQuery={cancelQuery}
          onRejectProposed={onRejectProposed}
          onAcceptProposed={
            proposedSource
              ? () => onAcceptProposed?.(proposedSource)
              : undefined
          }
          databases={databases?.data ?? []}
          onToggleDataReference={() => null}
          onToggleSnippetSidebar={() => null}
          onOpenModal={handleOpenModal}
          modalSnippet={modalSnippet}
          onChangeModalSnippet={setModalSnippet}
          onChangeNativeEditorSelection={setSelectionRange}
          nativeEditorSelectedText={selectedText}
        />
        <EditorValidationCard validationResult={validationResult} />
      </Stack>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={isPreviewQueryModalOpen}
          onClose={togglePreviewQueryModal}
        >
          <NativeQueryPreview query={question.query()} />
        </Modal>
      )}
    </>
  );
}
