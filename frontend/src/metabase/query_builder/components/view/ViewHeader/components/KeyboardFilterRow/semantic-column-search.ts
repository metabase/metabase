import { useEffect, useMemo, useRef, useState } from "react";

// Prototype: the TypeScript lib has no types for the Chrome Prompt API yet.
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

declare global {
  var LanguageModel:
    | {
        availability(): Promise<
          "unavailable" | "downloadable" | "downloading" | "available"
        >;
        create(options?: {
          initialPrompts?: {
            role: "system" | "user" | "assistant";
            content: string;
          }[];
        }): Promise<LanguageModelSession>;
      }
    | undefined;
}

const MAX_MATCHES = 3;
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 200;

const LOG_PREFIX = "[Semantic column search]";

// Prototype: logs each step, so that people can see the requests to the model
// and their timing in the browser console.
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args);
}

function getElapsedMs(startTime: number) {
  return Math.round(performance.now() - startTime);
}

type ColumnMatcher = {
  /** Indexes into the column labels, best match first. */
  search(query: string, signal?: AbortSignal): Promise<number[]>;
  destroy(): void;
};

/**
 * Prototype: matches a search word to columns by meaning, with Gemini Nano,
 * the on-device model in Chrome. Returns null when the browser has no
 * on-device model ready. It never starts the model download.
 */
async function createColumnMatcher(
  columnLabels: string[],
): Promise<ColumnMatcher | null> {
  if (typeof LanguageModel === "undefined") {
    log("off: this browser has no LanguageModel API");
    return null;
  }
  const availability = await LanguageModel.availability();
  if (availability !== "available") {
    log(`off: the on-device model is "${availability}"`);
    return null;
  }

  const systemPrompt = `You help a user find columns of a database table.
The user types a search word. Pick the columns whose meaning matches the word, best match first.
Match by meaning, not only by spelling. Example: "contact" matches email and phone.
Pick at most ${MAX_MATCHES} columns. Pick none when nothing matches.
Answer only with a JSON array of column numbers, for example [4,5] or [].

Columns:
${columnLabels.map((label, index) => `${index}: ${label}`).join("\n")}`;

  // The column list is in the system prompt of the base session. Chrome caches
  // it, so each search clones the session and sends only the search word.
  const createStartTime = performance.now();
  log(`creating a session for ${columnLabels.length} columns`, columnLabels);
  const base = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: systemPrompt }],
  });
  log(`session ready in ${getElapsedMs(createStartTime)} ms`);

  const schema = {
    type: "array",
    maxItems: MAX_MATCHES,
    items: { type: "integer", minimum: 0, maximum: columnLabels.length - 1 },
  };

  const search = async (query: string, signal?: AbortSignal) => {
    const startTime = performance.now();
    log(`→ "${query}"`);
    try {
      const indexes = await prompt(query, signal);
      const labels = indexes.map((index) => columnLabels[index]);
      log(
        `← "${query}" in ${getElapsedMs(startTime)} ms:`,
        labels.length > 0 ? labels : "no match",
      );
      return indexes;
    } catch (error) {
      if (signal?.aborted) {
        log(`✕ "${query}" aborted after ${getElapsedMs(startTime)} ms`);
      } else {
        log(`✕ "${query}" failed after ${getElapsedMs(startTime)} ms`, error);
      }
      throw error;
    }
  };

  const prompt = async (query: string, signal?: AbortSignal) => {
    const session = await base.clone({ signal });
    try {
      const answer = await session.prompt(query, {
        responseConstraint: schema,
        omitResponseConstraintInput: true,
        signal,
      });
      const parsed: unknown = JSON.parse(answer);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const indexes = parsed.filter(
        (value): value is number =>
          Number.isInteger(value) && value >= 0 && value < columnLabels.length,
      );
      return [...new Set(indexes)];
    } finally {
      session.destroy();
    }
  };

  // The first prompt of a session is slow, so do it before the user types.
  await search("warm-up").catch(() => undefined);

  return {
    search,
    destroy: () => base.destroy(),
  };
}

const IDLE_DESTROY_MS = 5 * 60 * 1000;

type SharedMatcher = {
  labelsKey: string;
  matcher: Promise<ColumnMatcher | null>;
  /** Results by query, for as long as the session lives. */
  cache: Map<string, number[]>;
  userCount: number;
  idleTimeoutId?: ReturnType<typeof setTimeout>;
};

// Prototype: one session for all the pills, while the columns stay the same.
// A session keeps the model in memory, so it is destroyed when it was not used
// for some minutes, or when the columns change.
let sharedMatcher: SharedMatcher | null = null;

function acquireSharedMatcher(columnLabels: string[]): SharedMatcher {
  const labelsKey = columnLabels.join("\n");
  if (sharedMatcher?.labelsKey === labelsKey) {
    clearTimeout(sharedMatcher.idleTimeoutId);
    sharedMatcher.userCount += 1;
    log("reusing the session");
    return sharedMatcher;
  }
  if (sharedMatcher != null) {
    destroySharedMatcher("the columns changed");
  }
  sharedMatcher = {
    labelsKey,
    matcher: createColumnMatcher(columnLabels).catch(() => null),
    cache: new Map(),
    userCount: 1,
  };
  return sharedMatcher;
}

function releaseSharedMatcher(entry: SharedMatcher) {
  entry.userCount -= 1;
  if (entry === sharedMatcher && entry.userCount === 0) {
    entry.idleTimeoutId = setTimeout(() => {
      if (entry === sharedMatcher && entry.userCount === 0) {
        destroySharedMatcher("it was not used for 5 minutes");
      }
    }, IDLE_DESTROY_MS);
  }
}

function destroySharedMatcher(reason: string) {
  const entry = sharedMatcher;
  sharedMatcher = null;
  if (entry != null) {
    clearTimeout(entry.idleTimeoutId);
    entry.matcher.then((matcher) => {
      if (matcher != null) {
        log(`destroying the session: ${reason}`);
        matcher.destroy();
      }
    });
  }
}

/**
 * Prototype: the indexes of the columns that match `query` by meaning, or an
 * empty list while the model answers, when the query is short, or when the
 * browser has no on-device model. The results are cached by query.
 */
export function useSemanticColumnMatches(
  columnLabels: string[],
  query: string,
  isEnabled: boolean,
): number[] {
  const labelsKey = columnLabels.join("\n");
  const stableLabels = useMemo(() => labelsKey.split("\n"), [labelsKey]);
  const [matcher, setMatcher] = useState<ColumnMatcher | null>(null);
  const cacheRef = useRef(new Map<string, number[]>());
  const [results, setResults] = useState<{
    query: string;
    indexes: number[];
  }>();
  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!isEnabled || stableLabels.length === 0) {
      return;
    }
    let isCancelled = false;
    const entry = acquireSharedMatcher(stableLabels);
    cacheRef.current = entry.cache;
    entry.matcher.then((newMatcher) => {
      if (!isCancelled) {
        setMatcher(newMatcher);
      }
    });
    return () => {
      isCancelled = true;
      releaseSharedMatcher(entry);
      setMatcher(null);
    };
  }, [isEnabled, stableLabels]);

  useEffect(() => {
    if (matcher == null || trimmedQuery.length < MIN_QUERY_LENGTH) {
      return;
    }
    const cached = cacheRef.current.get(trimmedQuery);
    if (cached != null) {
      log(
        `"${trimmedQuery}" from the cache:`,
        cached.length > 0
          ? cached.map((index) => stableLabels[index])
          : "no match",
      );
      setResults({ query: trimmedQuery, indexes: cached });
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      matcher
        .search(trimmedQuery, controller.signal)
        .then((indexes) => {
          cacheRef.current.set(trimmedQuery, indexes);
          setResults({ query: trimmedQuery, indexes });
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [matcher, trimmedQuery, stableLabels]);

  return results?.query === trimmedQuery ? results.indexes : NO_MATCHES;
}

const NO_MATCHES: number[] = [];
