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
import type { EditorState } from "@codemirror/state";
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

            const tag = matchTagAtCursor(context.state, {
              allowOpenEnded: true,
              position: context.pos,
            });

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

            if (tag.type === "snippet") {
              const query = tag.content.text;
              const results = snippets.filter(snippet =>
                snippet.name.toLowerCase().includes(query.toLowerCase()),
              );

              return {
                from: tag.content.from,
                validFor(text: string) {
                  return text.startsWith(query);
                },
                options: results.map(snippet => ({
                  label: snippet.name,
                  apply: tag.hasClosingTag
                    ? snippet.name
                    : `${snippet.name} }}`,
                  detail: t`Snippet`,
                  boost: 50,
                })),
              };
            }

            if (tag.type === "card") {
              const query = tag.content.text.replace(/^#/, "").trim();
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
                // -1 because we want to include the # in the autocomplete
                from: tag.content.from - 1,
                validFor(text: string) {
                  return text.startsWith(`#${query}`);
                },
                options: results.map(({ id, name, type, collection_name }) => ({
                  label: `#${id}-${slugg(name)}`,
                  detail: getCardAutocompleteResultMeta(type, collection_name),
                  apply: tag.hasClosingTag
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

export type TagMatch = {
  type: "variable" | "snippet" | "card";
  hasClosingTag: boolean;
  tag: {
    from: number;
    to: number;
    text: string;
  };
  content: {
    from: number;
    to: number;
    text: string;
  };
};

type MatchTagOptions = {
  // If set consider this position as the cursor position.
  // If not set, the cursor position is the current position of the cursor in the editor.
  position?: number;

  // If true, return the tag even it it does not have a closing tag.
  // In this case we assume the tag is still being authored and it runs until the end of the line.
  allowOpenEnded?: boolean;
};

// Looks for the tag that the cursor is inside of, or null if the cursor is not inside a tag.
// Tags are delimited by {{ and }}.
// This also returns a Match if the tag is opened, but not closed at the end of the line.
function matchTagAtCursor(
  state: EditorState,
  options: MatchTagOptions,
): TagMatch | null {
  const doc = state.doc.toString();
  const { position, allowOpenEnded } = options;

  if (
    position === undefined &&
    state.selection.main.from !== state.selection.main.to
  ) {
    return null;
  }

  const cursor = position ?? state.selection.main.from;

  let start = null;

  // look for the opening tag to the left of the cursor
  for (let idx = cursor; idx >= 0; idx--) {
    const currChar = doc[idx];
    const prevChar = doc[idx - 1];

    if (currChar === "\n") {
      // no tag opening found on this line
      return null;
    }

    if (currChar === "}" && prevChar === "}") {
      // closing bracket found before opening bracket
      // this means we are not in a tag
      return null;
    }

    if (currChar === "{" && prevChar === "{") {
      // we found the opening tag, exit the loop
      start = idx - 1;
      break;
    }
  }

  let end = null;

  // look for the closing tag to the right of the cursor
  for (let idx = cursor; idx < doc.length; idx++) {
    const currChar = doc[idx];
    const nextChar = doc[idx + 1];

    if (currChar === "\n") {
      if (allowOpenEnded) {
        // we ran into the end of the line
        // but we allow open ended tags, so the tag implicitly closes here
        end = idx;
        break;
      }

      // we ran into the end of the line without a closing tag
      // the tag is malformed
      return null;
    }

    if (currChar === "}" && nextChar === "}") {
      // we found the closing tag, exit the loop
      end = idx + 2;
      break;
    }
  }

  if (start == null || end == null) {
    return null;
  }

  const text = doc.slice(start, end);
  const prefix = text.match(/^\{\{\s*/)?.[0];
  const suffix = text.match(/\s*(\}\})?$/)?.[0];
  if (!prefix || !suffix) {
    return null;
  }

  const content = doc.slice(start + prefix.length, end - suffix.length);

  const tag = {
    text,
    from: start,
    to: end,
  };
  const hasClosingTag = tag.text.endsWith("}}");

  if (content.startsWith("#")) {
    return {
      type: "card",
      hasClosingTag,
      tag,
      content: {
        text: content.slice(1),
        from: start + prefix.length + 1,
        to: end - suffix.length,
      },
    };
  }

  if (content.toLowerCase().startsWith("snippet:")) {
    const snippet = content.match(/^snippet:\s*/)?.[0];
    if (!snippet) {
      return null;
    }
    return {
      type: "snippet",
      hasClosingTag,
      tag,
      content: {
        text: content.slice(snippet.length),
        from: start + prefix.length + snippet.length,
        to: end - suffix.length,
      },
    };
  }

  return {
    type: "variable",
    hasClosingTag,
    tag,
    content: {
      text: content,
      from: start + prefix.length,
      to: end - suffix.length,
    },
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
