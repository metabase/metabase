import {
  acceptCompletion,
  autocompletion,
  moveCompletionSelection,
} from "@codemirror/autocomplete";
import { indentMore } from "@codemirror/commands";
import {
  foldService,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Prec } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
  keymap,
} from "@codemirror/view";
import type {
  EditorState,
  Extension,
  Transaction,
} from "@uiw/react-codemirror";
import cx from "classnames";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";
import * as Lib from "metabase-lib";

import {
  useCardTagCompletion,
  useKeywordsCompletion,
  useLocalsCompletion,
  useReferencedCardCompletion,
  useSchemaCompletion,
  useSnippetCompletion,
} from "./completers";
import { language } from "./language";
import { getReferencedCardIds } from "./util";

type Options = {
  query: Lib.Query;
  onRunQuery?: () => void;
};

export function useExtensions({ query, onRunQuery }: Options): Extension[] {
  const { databaseId, engine, referencedCardIds } = useMemo(
    () => ({
      databaseId: Lib.databaseID(query),
      engine: Lib.engine(query),
      referencedCardIds: getReferencedCardIds(query),
    }),
    [query],
  );

  const schemaCompletion = useSchemaCompletion({ databaseId });
  const snippetCompletion = useSnippetCompletion();
  const cardTagCompletion = useCardTagCompletion({ databaseId });
  const referencedCardCompletion = useReferencedCardCompletion({
    referencedCardIds,
  });
  const localsCompletion = useLocalsCompletion({ engine });

  // TODO use this instead of language completion
  const keywordsCompletion = useKeywordsCompletion({ engine });

  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      language({ engine }),
      autocompletion({
        closeOnBlur: false,
        activateOnTyping: true,
        activateOnTypingDelay: 200,
        override: [
          schemaCompletion,
          snippetCompletion,
          cardTagCompletion,
          referencedCardCompletion,
          localsCompletion,
          keywordsCompletion,
        ],
      }),
      highlighting(),
      tagDecorator(),
      folds(),
      keyboardShortcuts({ onRunQuery }),
    ]
      .flat()
      .filter(isNotNull);
  }, [
    engine,
    schemaCompletion,
    snippetCompletion,
    cardTagCompletion,
    referencedCardCompletion,
    localsCompletion,
    keywordsCompletion,
    onRunQuery,
  ]);
}

type KeyboardShortcutOptions = {
  onRunQuery?: () => void;
};

function keyboardShortcuts({ onRunQuery }: KeyboardShortcutOptions) {
  // Stop Cmd+Enter in CodeMirror from inserting a newline
  // Has to be Prec.highest so that it overwrites after the default Cmd+Enter handler
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          onRunQuery?.();
          return true;
        },
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
    ]),
  );
}

function nonce() {
  // CodeMirror injects css into the DOM,
  // to make this work, it needs the have the correct CSP nonce.
  const nonce = getNonce();
  if (!nonce) {
    return null;
  }
  return EditorView.cspNonce.of(nonce);
}

/**
 * A CodeMirror service that folds code based on opening and closing pairs of parentheses, brackets, and braces.
 */
function folds() {
  const pairs = {
    "(": ")",
    "{": "}",
    "[": "]",
  };

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
    if (!left || !(left in pairs)) {
      return null;
    }

    const right = pairs[left as keyof typeof pairs];

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

function highlighting() {
  return syntaxHighlighting(metabaseSyntaxHighlighting);
}

function tagDecorator() {
  const decorator = new MatchDecorator({
    regexp: /\{\{([^\}]*)\}\}/g,
    decoration(match) {
      const content = match[1].trim();
      const isSnippet = content.toLowerCase().startsWith("snippet:");
      const isCard = content.startsWith("#");

      return Decoration.mark({
        tagName: "span",
        class: cx("cm-tag", {
          "cm-tag-variable": !isSnippet && !isCard,
          "cm-tag-snippet": isSnippet,
          "cm-tag-card": isCard,
        }),
        attributes: {
          "data-snippet": isSnippet.toString(),
          "data-card": isCard.toString(),
        },
      });
    },
  });

  return ViewPlugin.define(
    (view) => ({
      tags: decorator.createDeco(view),
      update(state) {
        this.tags = decorator.updateDeco(state, this.tags);
      },
    }),
    {
      decorations: (instance) => instance.tags,
    },
  );
}

export function insertIndent({
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
