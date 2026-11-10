import type { CompletionContext } from "@codemirror/autocomplete";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

import { getSupportedClauses } from "../clause";
import { formatIdentifier } from "../identifier";
import { tokenAtPos } from "../position";

import type { SuggestOptions } from "./suggest";
import { matchOptions } from "./text-match";
import type { ExpressionSuggestion } from "./types";
import {
  expressionClauseCompletion,
  isFieldReference,
  isIdentifier,
} from "./util";

// The TypeScript lib has no types for the Chrome Prompt API yet.
type LanguageModelSession = {
  prompt(
    input: string,
    options?: {
      responseConstraint?: object;
      omitResponseConstraintInput?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
};

type LanguageModelApi = {
  availability(): Promise<string>;
  create(options?: {
    initialPrompts?: {
      role: "system" | "user" | "assistant";
      content: string;
    }[];
  }): Promise<LanguageModelSession>;
};

// Few matches, because the model adds unrelated ones when it may pick more.
const MAX_MATCHES: Record<Kind, number> = { columns: 3, functions: 2 };
const MIN_WORD_LENGTH = 3;

type Kind = "columns" | "functions";
const LOG_PREFIX = "[Semantic autocomplete]";

// Logs each step, so that people can see the requests to the model and their
// timing in the browser console.
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args);
}

type Matcher = {
  search(word: string, signal: AbortSignal): Promise<number[]>;
};

async function createMatcher(
  kind: Kind,
  items: string[],
): Promise<Matcher | null> {
  // The Prompt API is a global only in Chrome, and the lib has no type for it.
  const languageModel = (globalThis as { LanguageModel?: LanguageModelApi })
    .LanguageModel;
  if (languageModel == null) {
    log("off: this browser has no LanguageModel API");
    return null;
  }
  const availability = await languageModel.availability();
  if (availability !== "available") {
    log(`off: the on-device model is "${availability}"`);
    return null;
  }

  const what =
    kind === "columns"
      ? "columns of a table"
      : "functions of a spreadsheet-like formula language";
  const systemPrompt = `You help a user find ${what} in a formula editor.
The user types a word. Pick the items that the user most likely wants when they type this word, best first.
Match by meaning, not by spelling. The user may use a word from SQL, a spreadsheet or a programming language, or a plain word.
Pick only items whose meaning is clearly the same or very close. Pick at most ${MAX_MATCHES[kind]} items. Pick none when you are not sure.
Answer only with a JSON array of item numbers, for example [4,5] or [].

Items:
${items.map((item, index) => `${index}: ${item}`).join("\n")}`;

  const startTime = performance.now();
  // The items are in the system prompt of the base session. Chrome caches it,
  // so each search clones the session and sends only the word.
  const base = await languageModel.create({
    initialPrompts: [
      { role: "system", content: systemPrompt },
      ...getExamples(kind, items),
    ],
  });
  log(
    `${kind}: session ready in ${Math.round(performance.now() - startTime)} ms`,
  );

  const schema = {
    type: "array",
    maxItems: MAX_MATCHES[kind],
    items: { type: "integer", minimum: 0, maximum: items.length - 1 },
  };
  const cache = new Map<string, number[]>();

  const search = async (word: string, signal: AbortSignal) => {
    const cached = cache.get(word);
    if (cached != null) {
      return cached;
    }
    const startTime = performance.now();
    const session = await base.clone({ signal });
    try {
      const answer = await session.prompt(word, {
        responseConstraint: schema,
        omitResponseConstraintInput: true,
        signal,
      });
      const parsed: unknown = JSON.parse(answer);
      const indexes = Array.isArray(parsed)
        ? parsed.filter(
            (value): value is number =>
              Number.isInteger(value) && value >= 0 && value < items.length,
          )
        : [];
      cache.set(word, indexes);
      log(
        `${kind}: "${word}" in ${Math.round(performance.now() - startTime)} ms:`,
        indexes.map((index) => items[index]),
      );
      return indexes;
    } finally {
      session.destroy();
    }
  };

  return { search };
}

// Example turns for the functions. Words about data, not about an operation,
// pick no function, because the model picks something for every word without
// them.
const FUNCTION_EXAMPLES: [word: string, names: string[]][] = [
  ["find", ["contains"]],
  ["join", ["concat"]],
  ["money", []],
  ["customer", []],
  ["age", ["datetimeDiff"]],
  ["where", []],
];

// Words about an operation, not about data, pick no column.
const COLUMN_EXAMPLES: [word: string, names: string[]][] = [
  ["round", []],
  ["today", []],
  ["split", []],
  ["first", []],
];

function getExamples(kind: Kind, items: string[]) {
  const examples = kind === "functions" ? FUNCTION_EXAMPLES : COLUMN_EXAMPLES;
  const indexOf = (name: string) =>
    items.findIndex((item) => item.startsWith(`${name}:`));
  return examples.flatMap(([word, names]) => {
    const indexes = names.map(indexOf);
    if (indexes.some((index) => index < 0)) {
      return [];
    }
    return [
      { role: "user" as const, content: word },
      { role: "assistant" as const, content: JSON.stringify(indexes) },
    ];
  });
}

// One session for each list of items, as long as the page lives.
const matchers = new Map<string, Promise<Matcher | null>>();

function getMatcher(kind: Kind, items: string[]) {
  const key = `${kind}\n${items.join("\n")}`;
  let matcher = matchers.get(key);
  if (matcher == null) {
    matcher = createMatcher(kind, items).catch((error) => {
      log("off: the session failed", error);
      return null;
    });
    matchers.set(key, matcher);
  }
  return matcher;
}

/**
 * A completion source that adds the options whose meaning matches the word,
 * with Gemini Nano, the on-device model of Chrome. It runs after the other
 * sources and leaves out the options that the text match already found.
 */
function suggestRelated(
  kind: Kind,
  options: ExpressionSuggestion[],
  describe: (option: ExpressionSuggestion) => string,
  acceptsToken: (token: ReturnType<typeof tokenAtPos>) => boolean,
) {
  if (options.length === 0) {
    return null;
  }
  const items = options.map(describe);
  // Start the session now: it takes some seconds, and the first word should
  // not wait for it.
  void getMatcher(kind, items);

  return async function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);
    if (token == null || !acceptsToken(token)) {
      return null;
    }
    const word = token.text
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .trim()
      .toLowerCase();
    if (word.length < MIN_WORD_LENGTH) {
      return null;
    }
    const matcher = await getMatcher(kind, items);
    if (matcher == null || context.aborted) {
      return null;
    }
    const controller = new AbortController();
    context.addEventListener("abort", () => controller.abort(), {
      onDocChange: true,
    });
    const indexes = await matcher
      .search(word, controller.signal)
      .catch(() => []);
    const textMatches = new Set(
      matchOptions(options, word).map((option) => option.label),
    );
    const related = indexes
      .map((index) => options[index])
      .filter((option) => option != null && !textMatches.has(option.label))
      .map((option) => ({ ...option, matches: [], hint: t`related` }));
    if (related.length === 0) {
      return null;
    }
    return {
      from: token.start,
      to: token.end,
      options: related,
      filter: false,
    };
  };
}

export function suggestRelatedColumns({
  query,
  stageIndex,
  availableColumns,
  columnsOutsideBrackets = true,
}: SuggestOptions) {
  const options: ExpressionSuggestion[] = availableColumns.map((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return {
      type: "field",
      label: formatIdentifier(info.longDisplayName),
      displayLabel: info.longDisplayName,
      icon: getColumnIcon(column),
      column,
    };
  });
  return suggestRelated(
    "columns",
    options,
    (option) => option.displayLabel ?? option.label,
    (token) =>
      isFieldReference(token) ||
      token?.text.startsWith("[") === true ||
      (columnsOutsideBrackets && isIdentifier(token)),
  );
}

export function suggestRelatedFunctions({
  expressionMode,
  database,
}: SuggestOptions) {
  const clauses = getSupportedClauses({ expressionMode, database });
  const options = clauses.map((clause) =>
    expressionClauseCompletion(clause, {
      type: expressionMode === "aggregation" ? "aggregation" : "function",
    }),
  );
  const descriptions = clauses.map((clause) => {
    const description = clause.description?.(database ?? {}) ?? "";
    // The first sentence is enough to tell what a function does.
    return `${clause.displayName}: ${description.split(/(?<=\.)\s/)[0]}`;
  });
  return suggestRelated(
    "functions",
    options,
    (option) => descriptions[options.indexOf(option)] ?? option.label,
    (token) => isIdentifier(token) && !isFieldReference(token),
  );
}
