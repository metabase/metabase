import type { EditorView } from "@codemirror/view";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  FormulaEditor,
  type NamedExpression,
} from "metabase/querying/components/FormulaEditor";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import {
  FormulaBarFrame,
  useFormulaBarOwnership,
  useFormulaBarSlot,
} from "../FormulaBar";

type ColumnFormulaBarOptions = {
  question: Question;
  readOnly?: boolean;
  isActive?: boolean;
  onQuestionChange: (question: Question) => void;
};

type ColumnFormulaBar = {
  /** Opens an empty formula, or focuses the current draft. */
  open: (() => void) | undefined;
  bar: ReactNode;
};

export function useColumnFormulaBar({
  question,
  readOnly = false,
  isActive = true,
  onQuestionChange,
}: ColumnFormulaBarOptions): ColumnFormulaBar {
  const formulaBarSlot = useFormulaBarSlot();
  const {
    isActive: isOwner,
    open: claimOwnership,
    close: releaseOwnership,
  } = useFormulaBarOwnership();
  const [editorKey, setEditorKey] = useState<number | null>(null);
  const nextEditorKey = useRef(0);
  const viewRef = useRef<EditorView | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocus = useRef(false);
  const open = useCallback(() => {
    if (isOwner && editorKey != null) {
      viewRef.current?.focus();
      return;
    }
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    nextEditorKey.current += 1;
    claimOwnership();
    setEditorKey(nextEditorKey.current);
  }, [editorKey, isOwner, claimOwnership]);
  const close = () => {
    shouldRestoreFocus.current = true;
    releaseOwnership();
    setEditorKey(null);
    viewRef.current = null;
  };

  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const isEnabled =
    isActive &&
    !isNative &&
    isEditable &&
    !readOnly &&
    !question.isArchived() &&
    formulaBarSlot != null;

  useEffect(() => {
    if (!isEnabled || !isOwner) {
      setEditorKey(null);
      viewRef.current = null;
      releaseOwnership();
    }
  }, [isEnabled, isOwner, releaseOwnership]);

  useEffect(() => {
    if (editorKey == null && shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    }
  }, [editorKey]);

  const query = useMemo(
    () =>
      isEnabled ? Lib.ensureFilterStage(question.query()) : question.query(),
    [question, isEnabled],
  );
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    editorKey != null && databaseId != null ? { id: databaseId } : skipToken,
  );

  const handleSubmit = ({ name, clause }: NamedExpression) => {
    const uniqueName = getUniqueExpressionName(query, -1, name);
    const nextQuery = Lib.expression(query, -1, uniqueName, clause);
    onQuestionChange(question.setQuery(nextQuery));
    close();
  };

  const bar =
    formulaBarSlot &&
    createPortal(
      <FormulaBarFrame>
        {isEnabled && isOwner && editorKey != null ? (
          <FormulaEditor
            key={editorKey}
            query={query}
            stageIndex={-1}
            database={database}
            expressionMode="expression"
            submitLabel={t`Add column`}
            onEditorCreate={(view) => {
              viewRef.current = view;
            }}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ) : null}
      </FormulaBarFrame>,
      formulaBarSlot,
    );

  return { open: isEnabled ? open : undefined, bar };
}
