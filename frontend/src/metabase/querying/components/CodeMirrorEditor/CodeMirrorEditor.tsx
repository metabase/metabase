import type { Extension } from "@codemirror/state";
import type { ViewUpdate } from "@uiw/react-codemirror";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";
import _ from "underscore";

import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";
import { Button, Flex, KeyboardShortcut } from "metabase/ui";
import { isEventOverElement } from "metabase/utils/dom";
import * as Lib from "metabase-lib";
import type { CardId } from "metabase-types/api";

import type { SelectionRange } from "../../editor/types";

import S from "./CodeMirrorEditor.module.css";
import { useExtensions } from "./extensions";
import { useDiffControls } from "./use-diff-controls";
import {
  getPlaceholderText,
  getSelectedRanges,
  matchCardIdAtCursor,
} from "./util";

export type CodeMirrorEditorProps = {
  query: Lib.Query;
  proposedQuery?: Lib.Query;
  highlightedLineNumbers?: number[];
  placeholder?: string;
  readOnly?: boolean;
  hasSqlGenerationAccess?: boolean;
  extensions?: Extension[];
  onChange?: (queryText: string) => void;
  onFormatQuery?: () => void;
  onRunQuery?: () => void;
  onCursorMoveOverCardTag?: (id: CardId) => void;
  onRightClickSelection?: () => void;
  onSelectionChange?: (range: SelectionRange[]) => void;
  onBlur?: () => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

export interface CodeMirrorEditorRef {
  focus: () => void;
  getSelectionTarget: () => Element | null;
}

export const CodeMirrorEditor = forwardRef<
  CodeMirrorEditorRef,
  CodeMirrorEditorProps
>(function CodeMirrorEditor(
  {
    query,
    proposedQuery,
    highlightedLineNumbers,
    placeholder: placeholderProp,
    readOnly,
    hasSqlGenerationAccess,
    extensions: customExtensions,
    onChange,
    onRunQuery,
    onSelectionChange,
    onRightClickSelection,
    onCursorMoveOverCardTag,
    onFormatQuery,
    onBlur,
    onAcceptProposed,
    onRejectProposed,
  },
  ref,
) {
  const editorRef = useRef<CodeMirrorRef>(null);
  const hasDiffControls = !!proposedQuery && !readOnly;
  const {
    extensions: diffControlsExtensions,
    portalTarget,
    shortcuts,
  } = useDiffControls({
    onAcceptProposed: hasDiffControls ? onAcceptProposed : undefined,
    onRejectProposed: hasDiffControls ? onRejectProposed : undefined,
  });
  const placeholder =
    placeholderProp ??
    getPlaceholderText(Lib.engine(query), hasSqlGenerationAccess);
  const baseExtensions = useExtensions({
    query,
    diff: !!proposedQuery,
    onRunQuery,
  });

  const extensions = useMemo(() => {
    return [
      ...baseExtensions,
      ...diffControlsExtensions,
      ...(customExtensions ?? []),
    ];
  }, [baseExtensions, customExtensions, diffControlsExtensions]);

  useImperativeHandle(ref, () => {
    return {
      focus() {
        editorRef.current?.editor?.focus();
      },
      getSelectionTarget() {
        return document.querySelector(".cm-selectionBackground");
      },
    };
  }, []);

  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      // handle selection changes
      if (onSelectionChange) {
        const beforeRanges = getSelectedRanges(update.startState);
        const afterRanges = getSelectedRanges(update.state);

        if (!_.isEqual(beforeRanges, afterRanges)) {
          onSelectionChange(afterRanges);
        }
      }
      if (onCursorMoveOverCardTag) {
        if (
          update.startState.selection.main.head !==
          update.state.selection.main.head
        ) {
          const cardId = matchCardIdAtCursor(update.state);
          if (cardId !== null) {
            onCursorMoveOverCardTag(cardId);
          }
        }
      }
    },
    [onSelectionChange, onCursorMoveOverCardTag],
  );

  useEffect(() => {
    function handler(evt: MouseEvent) {
      const selection = editorRef.current?.state?.selection.main;
      if (!selection) {
        return;
      }

      const selections = Array.from(
        document.querySelectorAll(".cm-selectionBackground"),
      );

      if (selections.some((selection) => isEventOverElement(evt, selection))) {
        evt.preventDefault();
        onRightClickSelection?.();
      }
    }
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [onRightClickSelection]);

  const highlightedRanges = useMemo(
    () => highlightedLineNumbers?.map((lineNumber) => ({ line: lineNumber })),
    [highlightedLineNumbers],
  );

  const value = useMemo(() => {
    return Lib.rawNativeQuery(proposedQuery ?? query);
  }, [proposedQuery, query]);

  return (
    <>
      <CodeMirror
        ref={editorRef}
        data-testid="native-query-editor"
        className={S.editor}
        editable={!readOnly}
        extensions={extensions}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        height="100%"
        onUpdate={handleUpdate}
        autoFocus
        autoCorrect="off"
        placeholder={placeholder}
        highlightRanges={highlightedRanges}
        onFormat={onFormatQuery}
        onBlur={onBlur}
      />
      {hasDiffControls &&
        onAcceptProposed &&
        onRejectProposed &&
        createPortal(
          <Flex gap="xs" py="xxs" px="xs" bg="background_page-secondary">
            <Button
              data-testid="accept-proposed-changes-button"
              variant="default"
              size="sm"
              onClick={onAcceptProposed}
              rightSection={
                <KeyboardShortcut shortcut={shortcuts.accept.hint} />
              }
            >
              {t`Accept`}
            </Button>
            <Button
              data-testid="reject-proposed-changes-button"
              variant="default"
              size="sm"
              onClick={onRejectProposed}
              rightSection={
                <KeyboardShortcut shortcut={shortcuts.reject.hint} />
              }
            >
              {t`Reject`}
            </Button>
          </Flex>,
          portalTarget,
        )}
    </>
  );
});
