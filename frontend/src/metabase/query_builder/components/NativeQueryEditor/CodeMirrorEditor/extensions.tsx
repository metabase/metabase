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

import { getCardAutocompleteResultMeta, matchTagAtCursor } from "./util";

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
  // h2: "h2",
};

type LanguageOptions = {
  engine?: string;
  matchStyle?: string;
  databaseId?: DatabaseId;
  snippets?: NativeQuerySnippet[];
};

function source(engine?: string) {
  switch (engine) {
    case "mongo":
    case "druid":
      return {
        language: json(),
      };

    case "bigquery-cloud-sdk":
    case "mysql":
    case "oracle":
    case "postgres":
    case "presto-jdbc":
    case "redshift":
    case "snowflake":
    case "sparksql":
    case "h2":
    default: {
      const dialect =
        engineToDialect[engine as keyof typeof engineToDialect] ?? StandardSQL;
      return {
        language: sql({
          dialect,
          upperCaseKeywords: true,
        }),
      };
    }
  }
}

function language({
  engine,
  matchStyle,
  databaseId,
  snippets = [],
}: LanguageOptions) {
  const { language } = source(engine);

  if (!language) {
    return [];
  }

  // wrap the language completer so that it does not trigger when we're inside of a tag
  async function fromLanguage(context: CompletionContext) {
    const facets = context.state.facet(language.language.data.reader);

    const complete = facets.find(
      facet => facet.autocomplete && facet.autocomplete !== autocomplete,
    )?.autocomplete;

    const tag = matchTagAtCursor(context.state, {
      allowOpenEnded: true,
      position: context.pos,
    });

    if (tag) {
      return null;
    }

    return complete?.(context);
  }

  // add custom tag completions
  async function autocomplete(context: CompletionContext) {
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
          apply: tag.hasClosingTag ? snippet.name : `${snippet.name} }}`,
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
  }

  return [
    language,
    autocompletion({
      closeOnBlur: false,
      activateOnTyping: true,
      override: [autocomplete, fromLanguage],
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
