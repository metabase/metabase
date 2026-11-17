import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useLatest } from "react-use";

import { isMac } from "metabase/utils/browser";

import { isOwnBarEvent, isTypingTarget } from "./bar-events";
import type { Token } from "./tokens";

export const MAX_HISTORY = 100;

export type HistorySnapshot = {
  tokens: Token[];
  caret: number;
};

type HistoryEntry = HistorySnapshot & {
  group?: string;
};

type HistoryAction = "undo" | "redo";

type HistoryKey = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

/** Undo is Cmd+Z on a Mac and Ctrl+Z elsewhere; redo adds Shift, or is Ctrl+Y. */
export function getHistoryAction({
  key,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
}: HistoryKey): HistoryAction | undefined {
  const isCommand = isMac() ? metaKey && !ctrlKey : ctrlKey && !metaKey;
  if (!isCommand || altKey) {
    return undefined;
  }
  const letter = key.toLowerCase();
  if (letter === "z") {
    return shiftKey ? "redo" : "undo";
  }
  if (letter === "y" && !isMac() && !shiftKey) {
    return "redo";
  }
  return undefined;
}

type UseExpressionHistoryOpts = {
  tokens: Token[];
  caretIndex: number;
  barRef: RefObject<HTMLDivElement | null>;
  onRestore: (snapshot: HistorySnapshot) => void;
};

/**
 * Prototype: undo and redo for the tokens of one bar. `record` takes a
 * snapshot of the tokens before a user edit; undo hands the latest snapshot
 * back through `onRestore`. Edits recorded with the same `group` make one
 * step, so a pill edited in place undoes as a whole.
 */
export function useExpressionHistory({
  tokens,
  caretIndex,
  barRef,
  onRestore,
}: UseExpressionHistoryOpts) {
  const snapshotRef = useLatest<HistorySnapshot>({ tokens, caret: caretIndex });
  const onRestoreRef = useLatest(onRestore);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);

  const record = useCallback(
    ({ group }: { group?: string } = {}) => {
      const undoStack = undoStackRef.current;
      const top = undoStack.at(-1);
      const isSameEdit =
        top != null &&
        (top.tokens === snapshotRef.current.tokens ||
          (group != null && top.group === group));
      if (isSameEdit) {
        return;
      }
      undoStack.push({ ...snapshotRef.current, group });
      if (undoStack.length > MAX_HISTORY) {
        undoStack.splice(0, undoStack.length - MAX_HISTORY);
      }
      redoStackRef.current = [];
    },
    [snapshotRef],
  );

  const discard = useCallback((group: string) => {
    if (undoStackRef.current.at(-1)?.group === group) {
      undoStackRef.current.pop();
    }
  }, []);

  const reset = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (entry == null) {
      return;
    }
    redoStackRef.current.push(snapshotRef.current);
    onRestoreRef.current({ tokens: entry.tokens, caret: entry.caret });
  }, [snapshotRef, onRestoreRef]);

  const redo = useCallback(() => {
    const snapshot = redoStackRef.current.pop();
    if (snapshot == null) {
      return;
    }
    undoStackRef.current.push(snapshotRef.current);
    onRestoreRef.current(snapshot);
  }, [snapshotRef, onRestoreRef]);

  /** Undo and Redo for the tokens. True when the key was taken. */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<Element>): boolean => {
      const action = getHistoryAction(event);
      if (
        action == null ||
        !isOwnBarEvent(barRef, event.target) ||
        isTypingTarget(event.target)
      ) {
        return false;
      }
      event.preventDefault();
      if (action === "undo") {
        undo();
      } else {
        redo();
      }
      return true;
    },
    [barRef, undo, redo],
  );

  return useMemo(
    () => ({ record, discard, reset, undo, redo, handleKeyDown }),
    [record, discard, reset, undo, redo, handleKeyDown],
  );
}
