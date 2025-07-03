import {
  acceptCompletion,
  moveCompletionSelection,
  nextSnippetField,
  prevSnippetField,
} from "@codemirror/autocomplete";
import { indentMore } from "@codemirror/commands";
import {
  bracketMatching,
  foldService,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import {
  type BasicSetupOptions,
  type EditorState,
  type Extension,
  type KeyBinding,
  Prec,
  type Transaction,
} from "@uiw/react-codemirror";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isMac } from "metabase/lib/browser";
import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";

import { highlightRanges } from "./highlights";

export type ExtensionOptions = {
  onFormat?: () => void;
  autoFocus?: boolean;
  autoCorrect?: string;
  tabIndex?: number;
  extensions?: (Extension | null)[];
};

export function useBasicSetup(
  basicSetup: boolean | BasicSetupOptions | undefined,
): boolean | BasicSetupOptions {
  return useMemo(() => {
    if (basicSetup === false) {
      return false;
    }

    const opts = basicSetup === true ? {} : basicSetup;
    return {
      ...opts,
      searchKeymap: false,
    };
  }, [basicSetup]);
}

export function useExtensions({
  extensions,
  ...options
}: ExtensionOptions): Extension[] {
  const baseExtensions = useBaseExtensions(options);
  return useMemo(
    () => [...baseExtensions, ...(extensions ?? [])].filter(isNotNull),
    [extensions, baseExtensions],
  );
}

function useBaseExtensions({
  onFormat,
  autoFocus,
  autoCorrect,
  tabIndex,
}: Omit<ExtensionOptions, "extensions">) {
  return useMemo(
    () => [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      bracketMatching({
        brackets: "()",
      }),
      keyboardShortcuts({ onFormat }),
      EditorView.lineWrapping,
      highlighting(),
      folds(),
      highlightRanges(),
      contentAttributes({
        autoFocus,
        autoCorrect,
        tabIndex,
      }),
    ],
    [onFormat, tabIndex, autoFocus, autoCorrect],
  );
}

// CodeMirror injects css into the DOM,
// to make this work, it needs the have the correct CSP nonce.
function nonce() {
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}

// Load the correct font family for the editor.
function fonts() {
  const shared = {
    fontSize: "12px",
    lineHeight: "normal",
    fontFamily: monospaceFontFamily,
  };

  return EditorView.theme({
    "&": shared,
    ".cm-content": shared,
  });
}

function keyboardShortcuts({ onFormat }: { onFormat?: () => void }) {
  // Stop Cmd+Enter in CodeMirror from inserting a newline
  // Has to be Prec.highest so that it overwrites after the default Cmd+Enter handler
  return Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: nextSnippetField,
      },
      {
        key: "Shift-Tab",
        run: prevSnippetField,
      },
      {
        key: "Tab",
        run: acceptCompletion,
      },
      {
        key: "Tab",
        run: insertIndent,
      },
      {
        key: "Mod-j",
        run: moveCompletionSelection(true),
      },
      {
        key: "Mod-k",
        run: moveCompletionSelection(false),
      },
      {
        key: "Shift-Mod-f",
        run: () => {
          onFormat?.();
          return true;
        },
      },
      ...searchKeymap.map((binding) => {
        if (binding.key === "Mod-f") {
          const replace: KeyBinding = {
            key: binding.key,
            scope: binding.scope,
            any(view, evt) {
              const meta = isMac() ? evt.metaKey : evt.ctrlKey;
              if (!evt.shiftKey && meta && evt.key === "f") {
                return openSearchPanel(view);
              }

              return false;
            },
          };
          return replace;
        }
        return binding;
      }),
    ]),
  );
}

function insertIndent({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}) {
  if (state.selection.ranges.some((r) => !r.empty)) {
    return indentMore({ state, dispatch });
  }

  const indent = state.facet(indentUnit);

  dispatch(
    state.update(state.replaceSelection(indent), {
      scrollIntoView: true,
      userEvent: "input",
    }),
  );

  return true;
}

function highlighting() {
  return syntaxHighlighting(metabaseSyntaxHighlighting);
}

// A CodeMirror service that folds code based on opening and closing
// pairs of parentheses, brackets, and braces.
function folds() {
  const pairs = {
    "(": ")",
    "{": "}",
    "[": "]",
  };

  function isOpening(character?: string): character is keyof typeof pairs {
    return typeof character === "string" && character in pairs;
  }

  return foldService.of(function (
    state: EditorState,
    from: number,
    to: number,
  ) {
    const line = state.doc.sliceString(from, to);
    const openIndex = line.search(/[({\[]/);
    if (openIndex === -1) {
      return null;
    }

    const left = line.at(openIndex);
    if (!isOpening(left)) {
      return null;
    }

    const right = pairs[left];
    const start = from + openIndex;
    const doc = state.doc.sliceString(start);

    let end = null;
    let open = 0;
    for (let idx = 1; idx < doc.length; idx++) {
      const char = doc.charAt(idx);
      if (char === left) {
        open++;
        continue;
      }
      if (char === right && open > 0) {
        open--;
        continue;
      }
      if (char === right && open === 0) {
        end = start + idx;
        break;
      }
    }

    if (end === null) {
      return null;
    }

    if (state.doc.lineAt(start + 1).number === state.doc.lineAt(end).number) {
      return null;
    }

    return {
      from: start + 1,
      to: end,
    };
  });
}

function contentAttributes({
  autoFocus,
  autoCorrect,
  tabIndex,
}: {
  autoFocus?: boolean;
  autoCorrect?: string;
  tabIndex?: number;
}) {
  const attrs: Record<string, string> = {};
  if (autoFocus) {
    // To be able to let make Mantine's FocusTrap work, the content
    // element needs a tabIndex and data-autofocus attribute.
    attrs["data-autofocus"] = "";
    attrs.autofocus = "";
  }
  if (autoCorrect != null) {
    attrs.autocorrect = autoCorrect;
  }
  if (tabIndex != null) {
    attrs.tabIndex = tabIndex.toString();
  }
  return EditorView.contentAttributes.of(attrs);
}
