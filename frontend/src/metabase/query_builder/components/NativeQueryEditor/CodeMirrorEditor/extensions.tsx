import { autocompletion } from "@codemirror/autocomplete";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
} from "@codemirror/view";
import {
  type Extension,
  type Range,
  StateEffect,
  StateField,
} from "@uiw/react-codemirror";
import cx from "classnames";
import { type RefObject, useEffect, useMemo } from "react";

import type { CodeMirrorRef } from "metabase/common/components/CodeMirror";
import { isNotNull } from "metabase/lib/types";
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
      highlightTags(),
      highlightLines(),
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            onRunQuery?.();
            return true;
          },
        },
      ]),
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

function highlightTags() {
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

const highlightLinesEffect = StateEffect.define<Range<Decoration>[]>();
const highlightLinesDecoration = Decoration.mark({
  class: "cm-highlight-line",
});

function highlightLines() {
  return StateField.define({
    create() {
      return Decoration.none;
    },
    update(value, transaction) {
      value = value.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (effect.is(highlightLinesEffect)) {
          value = value.update({ filter: () => false });
          value = value.update({ add: effect.value });
        }
      }

      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

export function useHighlightLines(
  editorRef: RefObject<CodeMirrorRef>,
  highlightedLineNumbers: number[] = [],
) {
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }

    const lines = highlightedLineNumbers.map((line) =>
      view.state.doc.line(line),
    );
    const lineRanges = lines.map((line) =>
      highlightLinesDecoration.range(line.from, line.to),
    );

    view.dispatch({ effects: highlightLinesEffect.of(lineRanges) });
  }, [editorRef, highlightedLineNumbers]);
}
