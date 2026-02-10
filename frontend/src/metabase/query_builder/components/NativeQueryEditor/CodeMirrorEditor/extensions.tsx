import { autocompletion } from "@codemirror/autocomplete";
import { unifiedMergeView } from "@codemirror/merge";
import { type Extension, Prec } from "@codemirror/state";
import {
  Decoration,
  MatchDecorator,
  ViewPlugin,
  keymap,
} from "@codemirror/view";
import cx from "classnames";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import S from "./CodeMirrorEditor.module.css";
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
  diff: boolean;
  onRunQuery?: () => void;
};

export function useExtensions({
  query,
  diff,
  onRunQuery,
}: Options): Extension[] {
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
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRunQuery?.();
              return true;
            },
          },
        ]),
      ),
      diff
        ? unifiedMergeView({
            original: Lib.rawNativeQuery(query) ?? "",
            mergeControls: false,
          })
        : null,
    ]
      .flat()
      .filter(isNotNull);
  }, [
    query,
    diff,
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
        class: cx(S.tag, {
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
