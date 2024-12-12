import {
  type CompletionContext,
  type CompletionSource,
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

import { isNotNull } from "metabase/lib/types";
import { monospaceFontFamily } from "metabase/styled-components/theme";
import type { CardId, DatabaseId } from "metabase-types/api";

import {
  useCardTagCompletion,
  useReferencedCardCompletion,
  useSchemaCompletion,
  useSnippetCompletion,
} from "./completers";
import { matchTagAtCursor } from "./util";

type ExtensionOptions = {
  engine?: string;
  databaseId?: DatabaseId;
  referencedQuestionIds?: CardId[];
};

export function useExtensions({
  engine,
  databaseId,
  referencedQuestionIds = [],
}: ExtensionOptions): Extension[] {
  const schemaCompletion = useSchemaCompletion({ databaseId });
  const snippetCompletion = useSnippetCompletion();
  const cardTagCompletion = useCardTagCompletion({ databaseId });
  const referencedCardCompletion = useReferencedCardCompletion({
    referencedQuestionIds,
  });

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
        ],
      }),
      highlighting(),
      tagDecorator(),
    ]
      .flat()
      .filter(isNotNull);
  }, [
    engine,
    schemaCompletion,
    snippetCompletion,
    cardTagCompletion,
    referencedCardCompletion,
  ]);
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
  completers?: CompletionSource[];
};

function source(engine?: string) {
  // TODO: this should be provided by the engine driver through the API
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

function language({ engine, completers = [] }: LanguageOptions) {
  const { language } = source(engine);

  if (!language) {
    return [];
  }

  // Wraps the language completer so that it does not trigger when we're
  // inside a variable or tag
  async function completeFromLanguage(context: CompletionContext) {
    const facets = context.state.facet(language.language.data.reader);
    const complete = facets.find(facet => facet.autocomplete)?.autocomplete;

    const tag = matchTagAtCursor(context.state, {
      allowOpenEnded: true,
      position: context.pos,
    });

    if (tag) {
      return null;
    }

    return complete?.(context);
  }

  return [
    language,
    autocompletion({
      closeOnBlur: false,
      activateOnTyping: true,
      activateOnTypingDelay: 250,
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
