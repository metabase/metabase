import {
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  acceptCompletion,
  autocompletion,
  moveCompletionSelection,
} from "@codemirror/autocomplete";
import { insertTab } from "@codemirror/commands";
import {
  HighlightStyle,
  foldService,
  indentService,
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
import { type Tag, tags } from "@lezer/highlight";
import type { EditorState, Extension } from "@uiw/react-codemirror";
import cx from "classnames";
import { getNonce } from "get-nonce";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import * as Lib from "metabase-lib";

import {
  useCardTagCompletion,
  useLocalsCompletion,
  useReferencedCardCompletion,
  useSchemaCompletion,
  useSnippetCompletion,
} from "./completers";
import {
  referencedQuestionIds as getReferencedQuestionIds,
  matchTagAtCursor,
  source,
} from "./util";

export function useExtensions(query: Lib.Query): Extension[] {
  const { databaseId, engine, referencedQuestionIds } = useMemo(
    () => ({
      databaseId: Lib.databaseID(query),
      engine: Lib.engine(query),
      referencedQuestionIds: getReferencedQuestionIds(query),
    }),
    [query],
  );

  const schemaCompletion = useSchemaCompletion({ databaseId });
  const snippetCompletion = useSnippetCompletion();
  const cardTagCompletion = useCardTagCompletion({ databaseId });
  const referencedCardCompletion = useReferencedCardCompletion({
    referencedQuestionIds,
  });
  const localsCompletion = useLocalsCompletion({ engine });

  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      language({
        engine,
        completers: [
          schemaCompletion,
          snippetCompletion,
          cardTagCompletion,
          referencedCardCompletion,
          localsCompletion,
        ],
      }),
      highlighting(),
      tagDecorator(),
      folds(),
      indentation(),
      disableCmdEnter(),
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
  ]);
}

function disableCmdEnter() {
  // Stop Cmd+Enter in CodeMirror from inserting a newline
  // Has to be Prec.highest so that it overwrites after the default Cmd+Enter handler
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => true,
      },
      {
        key: "Tab",
        run: acceptCompletion,
      },
      {
        key: "Tab",
        run: insertTab,
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

function indentation() {
  return [
    // set indentation to tab
    indentUnit.of("\t"),

    // persist the indentation from the previous line
    indentService.of((context, pos) => {
      const previousLine = context.lineAt(pos, -1);
      const previousLineText = previousLine.text.replaceAll(
        "\t",
        " ".repeat(context.state.tabSize),
      );
      return previousLineText.match(/^(\s)*/)?.[0].length ?? 0;
    }),
  ];
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

type LanguageOptions = {
  engine?: string | null;
  completers?: CompletionSource[];
};

function language({ engine, completers = [] }: LanguageOptions) {
  const { language } = source(engine);
  if (!language) {
    return [];
  }

  // Wraps the language completer so that it does not trigger when we're
  // inside a variable or tag
  async function completeFromLanguage(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    const facets = context.state.facet(language.language.data.reader);
    const complete: CompletionSource | undefined = facets.find(
      facet => facet.autocomplete,
    )?.autocomplete;

    const tag = matchTagAtCursor(context.state, {
      allowOpenEnded: true,
      position: context.pos,
    });

    if (tag) {
      return null;
    }

    const result = await complete?.(context);
    if (!result) {
      return null;
    }

    return {
      ...result,
      options: result.options.map(option => ({
        ...option,
        detail: option.detail ?? "keyword",
      })),
    };
  }

  return [
    language,
    autocompletion({
      closeOnBlur: false,
      activateOnTyping: true,
      activateOnTypingDelay: 200,
      override: [completeFromLanguage, ...completers],
    }),
  ];
}

const metabaseStyle = HighlightStyle.define(
  // Map all tags to CSS variables with the same name
  // See ./CodeMirrorEditor.module.css for the colors
  Object.entries(tags)
    .filter((item): item is [string, Tag] => typeof item[1] !== "function")
    .map(([name, tag]: [string, Tag]) => ({
      tag,
      class: `cm-token-${name}`,
    })),
);

function highlighting() {
  return syntaxHighlighting(metabaseStyle);
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
    view => ({
      tags: decorator.createDeco(view),
      update(state) {
        this.tags = decorator.updateDeco(state, this.tags);
      },
    }),
    {
      decorations: instance => instance.tags,
    },
  );
}
