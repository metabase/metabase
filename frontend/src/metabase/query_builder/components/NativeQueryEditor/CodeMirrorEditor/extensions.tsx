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
import { t } from "ttag";

import { useListSnippetsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";
import { MetabaseApi } from "metabase/services";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import type {
  CardType,
  DatabaseId,
  NativeQuerySnippet,
} from "metabase-types/api";

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
  const { data: snippets } = useListSnippetsQuery();

  return useMemo(() => {
    return [
      nonce(),
      fonts(),
      drawSelection({
        cursorBlinkRate: 1000,
        drawRangeCursor: false,
      }),
      language({ engine, matchStyle, databaseId, snippets }),
      highlighting(),
      tagDecorator(),
      autocompletion({
        closeOnBlur: false,
        activateOnTyping: true,
      }),
    ]
      .flat()
      .filter(isNotNull);
  }, [engine, matchStyle, databaseId, snippets]);
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
  snippets?: NativeQuerySnippet[];
};

function language({
  engine,
  matchStyle,
  databaseId,
  snippets = [],
}: LanguageOptions) {
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

            const tag = getTagAtCursor(context);

            if (!tag) {
              // the cursor is not inside in a variable, card or snippet tag
              // just complete using the database schema

              const word = context.matchBefore(/\w+/);
              if (!word) {
                return null;
              }

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

            const hasClosingTag = tag.text.endsWith("}}");
            const content = hasClosingTag
              ? tag.text.slice(2, -2).trim()
              : tag.text.slice(2).trim();

            if (content.toLowerCase().startsWith("snippet:")) {
              const prefix = tag.text.match(/^\{\{\s*snippet:\s*/i)?.[0];
              if (!prefix) {
                return null;
              }

              const query = content.replace(/^snippet:/i, "").trim();
              if (!query) {
                return null;
              }

              const results = snippets.filter(snippet =>
                snippet.name.toLowerCase().includes(query.toLowerCase()),
              );

              return {
                from: tag.from + prefix.length,
                validFor(text: string) {
                  return text.startsWith(query);
                },
                options: results.map(snippet => ({
                  label: snippet.name,
                  apply: hasClosingTag ? snippet.name : `${snippet.name} }}`,
                  detail: t`Snippet`,
                  boost: 50,
                })),
              };
            }

            if (content.startsWith("#")) {
              // the cursor is inside a card tag
              const prefix = tag.text.match(/^\{\{\s*#/i)?.[0];

              if (!prefix) {
                return null;
              }

              const query = content.trim().replace(/^#/, "").trim();
              if (!query) {
                return null;
              }

              const results: {
                id: number;
                name: string;
                type: CardType;
                collection_name: string;
              }[] = await MetabaseApi.db_card_autocomplete_suggestions({
                dbId: databaseId,
                query,
              });

              return {
                from: tag.from + prefix.length - 1,
                validFor(text: string) {
                  return text.startsWith(`#${query}`);
                },
                options: results.map(({ id, name, type, collection_name }) => ({
                  label: `#${id}-${slugg(name)}`,
                  detail: getCardAutocompleteResultMeta(type, collection_name),
                  apply: hasClosingTag
                    ? `#${id}-${slugg(name)}`
                    : `#${id}-${slugg(name)} }}`,
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

type Match = {
  from: number;
  to: number;
  text: string;
};

// Looks for the tag that the cursor is inside of, or null if the cursor is not inside a tag.
// Tags are delimited by {{ and }}.
// This also returns a Match if the tag is opened, but not closed at the end of the line.
function getTagAtCursor(context: CompletionContext): Match | null {
  const doc = context.state.doc.toString();
  let start = null;

  for (let idx = context.pos; idx >= 0; idx--) {
    const currChar = doc[idx];
    const prevChar = doc[idx - 1];

    if (currChar === "\n") {
      // no tag opening found on this line
      return null;
    }

    if (currChar === "}" && prevChar === "}") {
      // closing bracket found before opening bracket
      return null;
    }

    if (currChar === "{" && prevChar === "{") {
      start = idx - 1;
      break;
    }
  }

  let end = doc.length;

  for (let idx = context.pos; idx < doc.length; idx++) {
    const currChar = doc[idx];
    const nextChar = doc[idx + 1];

    if (currChar === "\n") {
      end = idx;
      break;
    }
    if (currChar === "}" && nextChar === "}") {
      end = idx + 2;
      break;
    }
  }

  if (start == null) {
    return null;
  }

  return {
    text: doc.slice(start, end),
    from: start,
    to: end,
  };
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
