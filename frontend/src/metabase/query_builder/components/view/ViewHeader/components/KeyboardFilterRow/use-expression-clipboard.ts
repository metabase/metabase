import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
  useRef,
} from "react";
import { msgid, ngettext, t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import type * as Lib from "metabase-lib";

import { isOwnBarEvent, isTypingTarget } from "./bar-events";
import {
  FILTER_CLIPBOARD_TYPE,
  deserializeTokens,
  getClipboardEntries,
  parseFilterClipboard,
} from "./clipboard";
import {
  type Token,
  type TokenRange,
  insertToken,
  removeRange,
} from "./tokens";

export type TokenChange = {
  tokens: Token[];
  caret: number;
  /** The tokens to leave selected, like a pasted range. */
  selection?: TokenRange;
};

type UseExpressionClipboardOpts = {
  query: Lib.Query;
  stageIndex: number;
  tokens: readonly Token[];
  caretIndex: number;
  selection: TokenRange | undefined;
  barRef: RefObject<HTMLDivElement | null>;
  /** The highlighted pill under the element, when it is one. */
  getHighlightedRange: (target: EventTarget | null) => TokenRange | undefined;
  onSelect: (range: TokenRange) => void;
  onChange: (change: TokenChange) => void;
};

const TEXTAREA_STYLE =
  "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";

/**
 * Prototype: the clipboard keys of the expression bar. With tokens selected
 * or a pill highlighted, Copy and Cut take those tokens, Select All takes
 * every token, and Paste puts copied tokens at the caret. An input with text
 * in it keeps the keys for that text.
 */
export function useExpressionClipboard({
  query,
  stageIndex,
  tokens,
  caretIndex,
  selection,
  barRef,
  getHighlightedRange,
  onSelect,
  onChange,
}: UseExpressionClipboardOpts) {
  const [sendToast] = useToast();
  // The entries that the copy in progress writes, for `handleCopy`.
  const pendingEntriesRef = useRef<Record<string, string>>(undefined);

  const isOwnEvent = (target: EventTarget | null) =>
    isOwnBarEvent(barRef, target);

  /**
   * Copies the range through the browser's own Copy command. The command only
   * runs with something selected, so a selected textarea in the bar stands in;
   * the copy event it fires goes to `handleCopy`, which writes the tokens.
   */
  const copyRange = (range: TokenRange): boolean => {
    const bar = barRef.current;
    const entries = getClipboardEntries(
      query,
      stageIndex,
      tokens.slice(range.start, range.end),
    );
    if (bar == null || entries == null) {
      return false;
    }
    const focused = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = entries["text/plain"] ?? "";
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.cssText = TEXTAREA_STYLE;
    bar.append(textarea);
    textarea.select();
    pendingEntriesRef.current = entries;
    const isCopied = document.execCommand("copy");
    pendingEntriesRef.current = undefined;
    textarea.remove();
    if (focused instanceof HTMLElement) {
      focused.focus();
    }
    return isCopied;
  };

  const handleCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const entries = pendingEntriesRef.current;
    if (entries == null) {
      return;
    }
    event.preventDefault();
    Object.entries(entries).forEach(([type, data]) =>
      event.clipboardData.setData(type, data),
    );
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!isOwnEvent(event.target) || isTypingTarget(event.target)) {
      return;
    }
    const payload = parseFilterClipboard(
      event.clipboardData.getData(FILTER_CLIPBOARD_TYPE),
    );
    if (payload == null) {
      return;
    }
    event.preventDefault();
    const result = deserializeTokens(query, stageIndex, payload);
    if (!result.ok) {
      sendToast({
        icon: "warning",
        message: t`These filters are from another database`,
      });
      return;
    }
    if (result.skippedCount > 0) {
      const count = result.skippedCount;
      sendToast({
        icon: "warning",
        message: ngettext(
          msgid`${count} filter skipped: its column is not in this question`,
          `${count} filters skipped: their columns are not in this question`,
          count,
        ),
      });
    }
    const [firstToken, ...restTokens] = result.tokens;
    if (firstToken == null) {
      return;
    }
    // The paste replaces the selection, and stitches an AND on either side
    // where two operands would otherwise touch.
    const base =
      selection != null
        ? removeRange(tokens, selection)
        : { tokens: [...tokens], caret: caretIndex };
    const first = insertToken(base.tokens, base.caret, firstToken);
    const next = restTokens.reduce(
      (inserted, token) => insertToken(inserted.tokens, inserted.caret, token),
      first,
    );
    // The pasted tokens stay selected, so Backspace takes them back out.
    onChange({
      tokens: next.tokens,
      caret: next.caret,
      selection: { start: first.caret - 1, end: next.caret },
    });
  };

  /** Select All, Copy and Cut for the tokens. True when the key was taken. */
  const handleKeyDown = (event: KeyboardEvent<Element>): boolean => {
    const hasCommand = event.metaKey || event.ctrlKey;
    if (
      !hasCommand ||
      !isOwnEvent(event.target) ||
      isTypingTarget(event.target)
    ) {
      return false;
    }
    const key = event.key.toLowerCase();
    if (key === "a") {
      if (tokens.length === 0) {
        return false;
      }
      event.preventDefault();
      onSelect({ start: 0, end: tokens.length });
      return true;
    }
    if (key !== "c" && key !== "x") {
      return false;
    }
    const range = selection ?? getHighlightedRange(event.target);
    if (range == null) {
      return false;
    }
    event.preventDefault();
    if (copyRange(range) && key === "x") {
      onChange(removeRange(tokens, range));
    }
    return true;
  };

  return { handleCopy, handlePaste, handleKeyDown };
}
