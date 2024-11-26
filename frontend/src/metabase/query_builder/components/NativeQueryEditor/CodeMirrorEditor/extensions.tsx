import {
  type CompletionContext,
  autocompletion,
} from "@codemirror/autocomplete";
import { json } from "@codemirror/lang-json";
import {
  MySQL,
  PLSQL,
  PostgreSQL,
  StandardSQL,
  sql,
} from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
} from "@codemirror/view";
import { type Tag, tags } from "@lezer/highlight";
import type { Extension } from "@uiw/react-codemirror";
import cx from "classnames";
import { getNonce } from "get-nonce";
import { useMemo } from "react";
import slugg from "slugg";

import { useSetting } from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";
import { MetabaseApi } from "metabase/services";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import type { CardType, DatabaseId } from "metabase-types/api";

import { getCardAutocompleteResultMeta } from "./util";

type ExtensionOptions = {
  engine?: string;
  databaseId?: DatabaseId;
};

export function useExtensions({
  engine,
  databaseId,
}: ExtensionOptions): Extension[] {
  const matchStyle = useSetting("native-query-autocomplete-match-style");

  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      language({ engine, matchStyle, databaseId }),
      highlighting(),
      tagDecorator(),
      autocompletion({
        closeOnBlur: false,
        activateOnTyping: true,
      }),
    ]
      .flat()
      .filter(isNotNull);
  }, [engine, matchStyle, databaseId]);
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

function fonts() {
  return EditorView.theme({
    "&": {
      fontSize: "12px",
      fontFamily: monospaceFontFamily,
    },
  });
}

const engineToDialect = {
  "bigquery-cloud-sdk": StandardSQL,
  mysql: MySQL,
  oracle: PLSQL,
  postgres: PostgreSQL,
  // TODO:
  // "presto-jdbc": "trino",
  // redshift: "redshift",
  // snowflake: "snowflake",
  // sparksql: "spark",
};

type LanguageOptions = {
  engine?: string;
  matchStyle?: string;
  databaseId?: DatabaseId;
};

function language({ engine, matchStyle, databaseId }: LanguageOptions) {
  switch (engine) {
    case "mongo":
    case "druid":
      return [
        json(),
        // TODO: custom completions
      ];
    default: {
      const dialect =
        engineToDialect[engine as keyof typeof engineToDialect] ?? StandardSQL;
      const lang = sql({
        dialect,
        upperCaseKeywords: true,
      });

      return [
        lang,
        lang.language.data.of({
          async autocomplete(context: CompletionContext) {
            if (matchStyle === "off" || databaseId == null) {
              return null;
            }

            const match = selectCompleter(context);
            if (!match) {
              return null;
            }

            const { type, word } = match;

            if (!word || word.text.length === 0 || word.from === word.to) {
              return null;
            }

            if (type === "schema") {
              const results: [string, string][] =
                await MetabaseApi.db_autocomplete_suggestions({
                  dbId: databaseId,
                  query: word.text.trim(),
                  matchStyle,
                });

              return {
                from: word.from,
                validFor(text: string) {
                  return text.startsWith(word.text);
                },
                options: results.map(([value, meta]) => ({
                  label: value,
                  detail: meta,
                  boost: 50,
                })),
              };
            }

            if (type === "snippet") {
              // TODO
            }

            if (type === "card") {
              const results: {
                id: number;
                name: string;
                type: CardType;
                collection_name: string;
              }[] = await MetabaseApi.db_card_autocomplete_suggestions({
                dbId: databaseId,
                query: word.text.trim(),
              });

              return {
                from: word.from,
                validFor(text: string) {
                  return text.startsWith(`#${word.text}`);
                },
                options: results.map(({ id, name, type, collection_name }) => ({
                  label: `#${id}-${slugg(name)}`,
                  detail: getCardAutocompleteResultMeta(type, collection_name),
                  boost: 50,
                })),
              };
            }

            return null;
          },
        }),
      ];
    }
  }
}

function selectCompleter(context: CompletionContext) {
  {
    const word = context.matchBefore(/\{\{\s*snippet:\s*([^\{\}]*)/i);
    if (word) {
      const start = word.text.indexOf(":") + 1;
      return {
        type: "snippet",
        word: {
          text: word.text.slice(start + 1),
          from: word.from + start,
          to: word.to,
        },
      };
    }
  }

  {
    const word = context.matchBefore(/\{\{\s*#\s*([^\{\}]*)/);
    if (word) {
      const start = word.text.indexOf("#");
      return {
        type: "card",
        word: {
          text: word.text.slice(start + 1),
          from: word.from + start,
          to: word.to,
        },
      };
    }
  }

  {
    const word = context.matchBefore(/\w+/);
    if (word) {
      return {
        type: "schema",
        word,
      };
    }
  }

  return null;
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
        class: cx(
          "cm-tag",
          !isSnippet && !isCard && "cm-tag-variable",
          isSnippet && "cm-tag-snippet",
          isCard && "cm-tag-card",
        ),
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
