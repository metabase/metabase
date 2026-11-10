import { getSupportedClauses } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import type { CompletionRequest } from "./ai-completion";
import {
  type CompletionColumn,
  describeCursor,
  getColumnNameCompletion,
  getComparedColumn,
  isAfterValue,
} from "./cursor-context";

// The TypeScript lib has no types for the Chrome Prompt API yet.
type LanguageModelPromptOptions = {
  responseConstraint?: object;
  omitResponseConstraintInput?: boolean;
  signal?: AbortSignal;
};

type LanguageModelSession = {
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
};

type LanguageModelApi = {
  availability(): Promise<
    "unavailable" | "downloadable" | "downloading" | "available"
  >;
  create(options?: {
    temperature?: number;
    topK?: number;
    initialPrompts?: {
      role: "system" | "user" | "assistant";
      content: string;
    }[];
  }): Promise<LanguageModelSession>;
};

const LOG_PREFIX = "[On-device completion]";

// Logs each step, so that people can see the requests to the model and their
// timing in the browser console.
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args);
}

function getElapsedMs(startTime: number) {
  return Math.round(performance.now() - startTime);
}

function getLanguageModel(): LanguageModelApi | undefined {
  // The Prompt API is a global only in Chrome.
  return (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;
}

export type CompletionContext = {
  expressionMode: Lib.ExpressionMode;
  columns: CompletionColumn[];
  name?: string;
  database?: Pick<Database, "features"> | null;
  /** Returns the editor's error for `source`, or null when it is valid. */
  validate: (source: string) => string | null;
  /** Some values of a column, when the column has a short list of values. */
  getColumnValues: (name: string) => Promise<string[]>;
};

const MAX_COLUMN_VALUES = 15;

async function describeCursorWithValues(
  prefix: string,
  context: CompletionContext,
) {
  const hint = describeCursor(prefix, context.columns);
  const column = getComparedColumn(prefix);
  if (column == null) {
    return hint;
  }
  const values = await context.getColumnValues(column).catch(() => []);
  if (values.length === 0) {
    return hint;
  }
  const shown = values
    .slice(0, MAX_COLUMN_VALUES)
    .map((value) => JSON.stringify(value));
  return `${hint}\nValues of ${column}: ${shown.join(", ")}${values.length > MAX_COLUMN_VALUES ? ", …" : ""}. Use one of them.`;
}

const MAX_CANDIDATES = 3;

const COMPLETION_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      maxItems: MAX_CANDIDATES,
      items: { type: "string", maxLength: 80 },
    },
  },
  required: ["candidates"],
};

// Low randomness gives fewer broken completions.
const SAMPLING = { temperature: 0.1, topK: 1 };

export function getFunctionList({
  expressionMode,
  database,
}: Pick<CompletionContext, "expressionMode" | "database">) {
  return getSupportedClauses({ expressionMode, database })
    .map((clause) => {
      const args = clause.args.map((arg) =>
        arg.optional ? `${arg.name}?` : arg.name,
      );
      if (clause.multiple) {
        args.push("…");
      }
      return `${clause.displayName}(${args.join(", ")})`;
    })
    .join("\n");
}

function getModeRule(expressionMode: Lib.ExpressionMode) {
  switch (expressionMode) {
    case "filter":
      return "The formula must return True or False.";
    case "aggregation":
      return "The formula must use an aggregation function, for example Sum([Total]).";
    default:
      return "The formula computes one value for each row. It cannot use aggregation functions.";
  }
}

function getSystemPrompt(context: CompletionContext) {
  return `You are a code completion engine for spreadsheet-like formulas. You return the text that goes at the cursor.

Formula syntax:
- A column is written in square brackets: [Total]. Only the columns in the list below exist. Never write a column name without brackets.
- Text is in double quotes: "Large". A bare word without quotes or brackets is an error.
- Numbers: 5, 0.2. Booleans: True, False.
- Operators: + - * / = != < <= > >= AND OR NOT.
- Function call: name(arg1, arg2), arguments separated by ", ".
- ${getModeRule(context.expressionMode)}

Rules:
- Return only the new text for the cursor. Never repeat the text before or after the cursor.
- The text before + your text + the text after must be a valid formula.
- Keep it short: finish the current argument or value, and the arguments that must follow it.
- Return up to ${MAX_CANDIDATES} different candidates, best first. Return [] when the formula is complete.

Columns (name: type):
${context.columns.map((column) => `${column.name}: ${column.type}`).join("\n")}

Functions:
${getFunctionList(context)}`;
}

function getInput(
  prefix: string,
  suffix: string,
  name: string | undefined,
  hint: string,
) {
  return `${name ? `Column name: ${name}\n` : ""}Before the cursor: ${prefix}\nAfter the cursor: ${suffix || "(nothing)"}\nHint: ${hint}`;
}

// Example turns teach the answer format and the syntax better than rules. The
// columns in them are not real, so a copied answer fails the validation.
const EXAMPLES: [
  prefix: string,
  suffix: string,
  name: string | null,
  hint: string,
  candidates: string[],
][] = [
  [
    "[Pri",
    "]",
    null,
    `The cursor is inside the column name "[Pri". Return the rest of one of these names, without the part before the cursor: [Price], [Priority].`,
    ["ce", "ority"],
  ],
  [
    'case([Score] > 90, "High", ',
    ")",
    "Grade",
    `The cursor is in case(condition, output, …), after a condition and its output. Write either the default output (a text in double quotes, a number or a column), or another condition and its output, for example: [Total] > 100, "Medium".`,
    ['[Score] > 50, "Medium", "Low"', '"Low"'],
  ],
  [
    "datetimeDiff([Created At], ",
    ")",
    "Age Days",
    `The cursor is in argument 2 of datetimeDiff(datetime1, datetime2, unit): datetime2, of type datetime.\nColumns of type datetime: [Created At], [Closed At].\nAfter it come the arguments: unit. Write them too, separated by ", ".`,
    ['[Closed At], "day"', 'now(), "day"'],
  ],
  [
    "[Price] * ",
    "",
    "Price With Tax",
    "The cursor is after an operator or an opening parenthesis. Write the value that comes next.",
    ["1.2", "[Quantity]"],
  ],
  [
    "upper(",
    ")",
    null,
    "The cursor is in argument 1 of upper(value): value, of type string.\nColumns of type string: [Name], [City].",
    ["[Name]", "[City]"],
  ],
  [
    "[Price] - [Cost]",
    "",
    "Margin",
    "The text before the cursor ends with a complete value. Continue with an operator and a value only when it is obvious, otherwise return an empty completion.",
    [],
  ],
];

/** Remove the part of `completion` that repeats the end of `prefix` or the start of `suffix`. */
function trimOverlap(completion: string, prefix: string, suffix: string) {
  let result = completion;
  for (let n = Math.min(prefix.length, result.length); n > 2; n--) {
    if (result.startsWith(prefix.slice(prefix.length - n))) {
      result = result.slice(n);
      break;
    }
  }
  for (let n = Math.min(suffix.length, result.length); n > 0; n--) {
    if (result.endsWith(suffix.slice(0, n))) {
      return result.slice(0, result.length - n);
    }
  }
  return result;
}

/** Fix the small mistakes that a small model often makes. */
function repair(text: string) {
  return text
    .split(/[\r\n]/)[0]
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\[(-?\d+(?:\.\d+)?)\]/g, "$1");
}

/**
 * True when the completed text is valid, or only lacks arguments that the
 * user can still type.
 */
function isAcceptable(error: string | null) {
  return error == null || /expects .*argument/i.test(error);
}

/**
 * Validate a candidate. A bare word that the validator takes for an unknown
 * column is usually a text without its quotes, so try it again with quotes.
 */
function check(
  candidate: string,
  prefix: string,
  suffix: string,
  validate: CompletionContext["validate"],
) {
  const error = validate(prefix + candidate + suffix);
  const word = candidate.trim();
  if (
    error != null &&
    /^Unknown column/.test(error) &&
    /^[\p{L}\p{N}_ -]+$/u.test(word) &&
    // There is no null literal; a quoted "null" would be a text.
    !/^(null|none|nil|undefined)$/i.test(word)
  ) {
    const quoted = candidate.replace(word, JSON.stringify(word));
    const quotedError = validate(prefix + quoted + suffix);
    if (isAcceptable(quotedError)) {
      return { candidate: quoted, error: quotedError };
    }
  }
  return { candidate, error };
}

type Completer = {
  complete(request: CompletionRequest, signal: AbortSignal): Promise<string>;
  destroy(): void;
};

async function createCompleter(
  context: CompletionContext,
): Promise<Completer | null> {
  const languageModel = getLanguageModel();
  if (languageModel == null) {
    log("off: this browser has no LanguageModel API");
    return null;
  }
  const availability = await languageModel.availability();
  if (availability !== "available") {
    log(`off: the on-device model is "${availability}"`);
    return null;
  }

  // The context is in the system prompt of the base session. Chrome caches
  // it, so each request clones the session and sends only the expression.
  const systemPrompt = getSystemPrompt(context);
  const initialPrompts = [
    { role: "system" as const, content: systemPrompt },
    ...EXAMPLES.flatMap(([prefix, suffix, name, hint, candidates]) => [
      {
        role: "user" as const,
        content: getInput(prefix, suffix, name ?? undefined, hint),
      },
      {
        role: "assistant" as const,
        content: JSON.stringify({ candidates }),
      },
    ]),
  ];
  const createStartTime = performance.now();
  log(`creating a session, ${systemPrompt.length} characters of context`);
  const base = await languageModel
    .create({ initialPrompts, ...SAMPLING })
    .catch(() => {
      log("the sampling options are not supported, using the defaults");
      return languageModel.create({ initialPrompts });
    });
  log(`session ready in ${getElapsedMs(createStartTime)} ms`);

  const complete = async (
    { prefix, suffix }: CompletionRequest,
    signal: AbortSignal,
  ) => {
    const startTime = performance.now();
    const columnName = getColumnNameCompletion(prefix, suffix, context.columns);
    if (columnName != null) {
      log("column name from the list:", JSON.stringify(columnName));
      return columnName;
    }
    const hint = await describeCursorWithValues(prefix, context);
    if (signal.aborted) {
      throw signal.reason;
    }
    log("→", `${prefix}⟨cursor⟩${suffix}`, `\n  hint: ${hint}`);
    const session = await base.clone({ signal });
    try {
      const answer = await session.prompt(
        getInput(prefix, suffix, context.name, hint),
        {
          responseConstraint: COMPLETION_SCHEMA,
          omitResponseConstraintInput: true,
          signal,
        },
      );
      const parsed: { candidates?: unknown } = JSON.parse(answer);
      const candidates = (
        Array.isArray(parsed.candidates) ? parsed.candidates : []
      )
        .filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
        .map((candidate) => trimOverlap(repair(candidate), prefix, suffix))
        .filter((candidate) => candidate.trim() !== "")
        // After a complete value only an operator, a comma or a parenthesis
        // can follow, else the candidate sticks to the value: `0` + `0`.
        .filter(
          (candidate) => !isAfterValue(prefix) || !/^[\w["'.]/.test(candidate),
        );
      const checked = candidates.map((candidate) =>
        check(candidate, prefix, suffix, context.validate),
      );
      const completion =
        checked.find(({ error }) => isAcceptable(error))?.candidate ?? "";
      log(
        `← in ${getElapsedMs(startTime)} ms:`,
        JSON.stringify(completion),
        checked.map(({ candidate, error }) =>
          isAcceptable(error) ? `✓ ${candidate}` : `✕ ${candidate} (${error})`,
        ),
      );
      return completion;
    } catch (error) {
      log(
        signal.aborted ? "✕ aborted after" : "✕ failed after",
        `${getElapsedMs(startTime)} ms`,
        signal.aborted ? "" : error,
      );
      throw error;
    } finally {
      session.destroy();
    }
  };

  // The first prompt of a session is slow, so do it before the user waits.
  await complete(
    { prefix: "concat(", suffix: ")" },
    new AbortController().signal,
  ).catch(() => undefined);

  return { complete, destroy: () => base.destroy() };
}

const IDLE_DESTROY_MS = 5 * 60 * 1000;

// One session while the context stays the same. A session keeps the model in
// memory, so it is destroyed after some idle minutes, or when the context
// changes.
let shared: {
  key: string;
  completer: Promise<Completer | null>;
  idleTimeoutId?: ReturnType<typeof setTimeout>;
} | null = null;

function getCompleter(context: CompletionContext) {
  const key = JSON.stringify([
    context.expressionMode,
    context.columns.map((column) => column.name),
  ]);
  if (shared?.key !== key) {
    shared?.completer.then((completer) => completer?.destroy());
    shared = {
      key,
      completer: createCompleter(context).catch((error) => {
        log("off: the session failed", error);
        return null;
      }),
    };
  }
  const entry = shared;
  clearTimeout(entry.idleTimeoutId);
  entry.idleTimeoutId = setTimeout(() => {
    if (shared === entry) {
      shared = null;
      log("destroying the session: it was not used for 5 minutes");
      entry.completer.then((completer) => completer?.destroy());
    }
  }, IDLE_DESTROY_MS);
  return entry.completer;
}

/** Start the session early, so that the first completion does not wait for it. */
export function prepareOnDeviceCompletion(context: CompletionContext) {
  void getCompleter(context);
}

/**
 * Fill-in-the-middle completion with Gemini Nano, the on-device model in
 * Chrome. It gives no completion when the browser has no model ready. It
 * never starts the model download.
 */
export function completeOnDevice(
  context: CompletionContext,
  request: CompletionRequest,
) {
  const controller = new AbortController();
  const promise = getCompleter(context).then((completer) =>
    completer ? completer.complete(request, controller.signal) : "",
  );
  return { promise, abort: () => controller.abort() };
}
