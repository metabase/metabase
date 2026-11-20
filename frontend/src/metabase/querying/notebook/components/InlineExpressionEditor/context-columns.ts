import * as Lib from "metabase-lib";

/** How the preview picks columns that help to recognize a row. */
export type ContextColumnsMode = "off" | "heuristic" | "model";

const MAX_CONTEXT_COLUMNS = 2;
// The preview waits for the model only this long, then uses the heuristic.
const MODEL_TIMEOUT_MS = 4000;
// A browser without the model can leave the availability check hanging.
const AVAILABILITY_TIMEOUT_MS = 1000;
const LOG_PREFIX = "[Preview context columns]";

// The TypeScript lib has no types for the Chrome Prompt API yet.
type LanguageModelSession = {
  prompt(
    input: string,
    options?: { responseConstraint?: object; signal?: AbortSignal },
  ): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
};

type LanguageModelApi = {
  availability(): Promise<string>;
  create(options?: {
    initialPrompts?: { role: "system"; content: string }[];
  }): Promise<LanguageModelSession>;
};

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args);
}

type Candidate = {
  column: Lib.ColumnMetadata;
  name: string;
  semanticType: string | null;
};

/**
 * The columns of the source table that the expression does not use and that
 * can tell what a row is about, like a title. IDs, keys and columns of other
 * tables do not count.
 */
export function getContextCandidates(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  usedNames: Set<string>,
): Candidate[] {
  return columns.flatMap((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    if (
      usedNames.has(info.longDisplayName) ||
      info.isFromJoin ||
      info.isImplicitlyJoinable ||
      info.isCalculated ||
      Lib.isPrimaryKey(column) ||
      Lib.isForeignKey(column)
    ) {
      return [];
    }
    return [
      {
        column,
        name: info.longDisplayName,
        semanticType: info.semanticType,
      },
    ];
  });
}

/** The title or the name of the row, without a model. */
function pickByType(candidates: Candidate[]) {
  const candidate =
    candidates.find(({ column }) => Lib.isTitle(column)) ??
    candidates.find(({ column }) => Lib.isEntityName(column));
  return candidate != null ? [candidate.name] : [];
}

const SYSTEM_PROMPT = `A user writes a formula in a table, and checks its result on a few sample rows.
Pick the columns that help the user see what each row is about, so that the result makes sense to them: a title, a name, a description, or a column that the result depends on in real life.
Do not pick IDs, technical columns, or columns that only repeat what the formula uses. Pick at most ${MAX_CONTEXT_COLUMNS} columns, best first. Pick none when no column helps.
Answer only with a JSON array of column numbers, for example [2] or [].`;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function createBaseSession(): Promise<LanguageModelSession | null> {
  // The Prompt API is a global only in Chrome, and the lib has no type for it.
  const languageModel = (globalThis as { LanguageModel?: LanguageModelApi })
    .LanguageModel;
  if (languageModel == null) {
    log("off: this browser has no LanguageModel API");
    return null;
  }
  const availability = await withTimeout(
    languageModel.availability(),
    AVAILABILITY_TIMEOUT_MS,
    "no answer",
  );
  if (availability !== "available") {
    log(`off: the on-device model is "${availability}"`);
    return null;
  }
  const startTime = performance.now();
  // Chrome caches the system prompt of this session; each pick clones it.
  const session = await languageModel.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
  });
  log(`session ready in ${Math.round(performance.now() - startTime)} ms`);
  return session;
}

// One check of the model, and one session, as long as the page lives.
let baseSession: Promise<LanguageModelSession | null> | undefined;

function getBaseSession() {
  baseSession ??= createBaseSession().catch((error) => {
    log("off: the session failed", error);
    return null;
  });
  return baseSession;
}

async function pickByModel(
  source: string,
  resultName: string,
  candidates: Candidate[],
  signal: AbortSignal,
): Promise<string[] | null> {
  const base = await getBaseSession();
  if (base == null) {
    return null;
  }
  const columnList = candidates
    .map(
      ({ name, semanticType }, index) =>
        `${index}: ${name}${semanticType != null ? ` (${semanticType.replace("type/", "")})` : ""}`,
    )
    .join("\n");
  const prompt = `Formula for the column "${resultName}":
${source}

Columns:
${columnList}`;

  const startTime = performance.now();
  const session = await base.clone({ signal });
  try {
    const answer = await session.prompt(prompt, {
      responseConstraint: {
        type: "array",
        maxItems: MAX_CONTEXT_COLUMNS,
        items: { type: "integer", minimum: 0, maximum: candidates.length - 1 },
      },
      signal,
    });
    const parsed: unknown = JSON.parse(answer);
    const names = Array.isArray(parsed)
      ? parsed
          .filter(
            (value): value is number =>
              Number.isInteger(value) &&
              value >= 0 &&
              value < candidates.length,
          )
          .map((index) => candidates[index].name)
      : [];
    log(`picked in ${Math.round(performance.now() - startTime)} ms:`, names);
    return names;
  } finally {
    session.destroy();
  }
}

/**
 * The names of at most two columns that help to recognize a row in the
 * preview. The on-device model picks them by meaning; without it, or when it
 * is slow, the title or the name of the row.
 */
export async function pickContextColumns(
  mode: ContextColumnsMode,
  source: string,
  resultName: string,
  candidates: Candidate[],
): Promise<string[]> {
  if (mode === "off" || candidates.length === 0) {
    return [];
  }
  if (mode === "heuristic") {
    return pickByType(candidates);
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // The model can also hang before it gets the signal, while it loads.
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      log(`no answer in ${MODEL_TIMEOUT_MS} ms, using the title instead`);
      controller.abort();
      resolve(null);
    }, MODEL_TIMEOUT_MS);
  });
  const names = await Promise.race([
    pickByModel(source, resultName, candidates, controller.signal).catch(
      (error) => {
        log("failed, using the title instead:", error);
        return null;
      },
    ),
    timeout,
  ]);
  clearTimeout(timeoutId);
  return names ?? pickByType(candidates);
}
