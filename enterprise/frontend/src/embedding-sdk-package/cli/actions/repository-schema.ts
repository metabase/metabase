import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { getResourceSyncCredentials } from "../../data-app-query-sync/env";

type Entry = { model: string; id: string };
type Document = Record<string, unknown> & { "serdes/meta": Entry[] };
type Source = { file: string; document: Document };
type Scope = {
  database?: string;
  libraryCollections?: string[];
  includeDataLibrary?: boolean;
};
type Field = {
  id: number;
  table_id: number;
  name: string;
  display_name?: string;
  description?: string;
  base_type?: string;
  effective_type?: string;
  semantic_type?: string;
  parent_id?: number;
};
type Table = {
  id: number;
  name: string;
  schema: string | null;
  fields: Field[];
};
type Metadata = { id: number; name: string; tables: Table[] };
type Snapshot = {
  version: 1;
  fetchedAt: number;
  origin: string;
  authHash: string;
  scopeKey: string;
  databases: Metadata[];
};
type Options = Scope & {
  appRoot: string;
  repositoryRoot?: string;
  forceRefresh?: boolean;
  maxAgeMinutes?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEntry = (value: unknown): value is Entry =>
  isRecord(value) &&
  typeof value.model === "string" &&
  typeof value.id === "string";

const identity = (entries: Entry[]) =>
  entries.map(({ model, id }) => `${model}:${id}`).join("/");

function tablePath(meta: Entry[]): unknown[] {
  return [meta[0].id, schemaName(meta), meta.at(-1)!.id];
}

function schemaName(meta: Entry[]): string | null {
  return meta.length === 2 ? null : meta[1].id || null;
}

function normalizePath(reference: unknown): unknown {
  if (!Array.isArray(reference) || reference.length < 3) {
    return reference;
  }
  return [reference[0], reference[1] || null, ...reference.slice(2)];
}

function sourceTablePath(document: Document): unknown {
  const definition = document.definition;
  if (!isRecord(definition)) {
    return undefined;
  }
  if (Array.isArray(definition.stages) && isRecord(definition.stages[0])) {
    return normalizePath(definition.stages[0]["source-table"]);
  }
  return normalizePath(definition["source-table"]);
}

function readRepository(root: string): {
  sources: Source[];
  yamlFileCount: number;
} {
  const sources: Source[] = [];
  let yamlFileCount = 0;
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
        yamlFileCount += 1;
        const parsed: unknown = parseYaml(fs.readFileSync(file, "utf8"));
        if (!isRecord(parsed) || !Array.isArray(parsed["serdes/meta"])) {
          continue;
        }
        const entries = parsed["serdes/meta"];
        if (!entries.every(isEntry)) {
          throw new Error(`${file}: invalid serdes/meta`);
        }
        sources.push({ file, document: { ...parsed, "serdes/meta": entries } });
      }
    }
  };
  for (const directory of ["databases", "collections"]) {
    const location = path.join(root, directory);
    if (fs.existsSync(location)) {
      walk(location);
    }
  }
  const tableByIdentity = new Map(
    sources
      .filter(
        ({ document }) => document["serdes/meta"].at(-1)?.model === "Table",
      )
      .map((source) => [identity(source.document["serdes/meta"]), source]),
  );
  for (const source of [...sources]) {
    const { document } = source;
    const meta = document["serdes/meta"];
    if (meta.at(-1)?.model !== "TableUserSettings") {
      continue;
    }
    const table = tableByIdentity.get(identity(meta.slice(0, -1)));
    if (!table) {
      sources.push({
        file: source.file,
        document: { ...document, "serdes/meta": meta.slice(0, -1) },
      });
      continue;
    }
    for (const setting of [
      "display_name",
      "description",
      "is_published",
      "collection_id",
    ]) {
      if (Object.hasOwn(document, setting)) {
        table.document[setting] = document[setting];
      }
    }
  }
  return { sources, yamlFileCount };
}

function findRepositoryRoot(appRoot: string): string {
  for (let current = path.resolve(appRoot); ; current = path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, "databases")) ||
      fs.existsSync(path.join(current, "collections"))
    ) {
      return current;
    }
    if (current === path.dirname(current)) {
      throw new Error(
        `No repository representations found above ${appRoot}. Pass --repository-root.`,
      );
    }
  }
}

function selectTables(sources: Source[], scope: Scope): Source[] {
  if (
    scope.database &&
    (scope.libraryCollections?.length || scope.includeDataLibrary)
  ) {
    throw new Error("Database and library scopes are mutually exclusive.");
  }
  if (
    !scope.database &&
    !scope.libraryCollections?.length &&
    !scope.includeDataLibrary
  ) {
    throw new Error("An explicit database or Data library scope is required.");
  }
  const collections = sources.filter(
    ({ document }) => document["serdes/meta"].at(-1)?.model === "Collection",
  );
  const collectionById = new Map(
    collections.map(({ document }) => [String(document.entity_id), document]),
  );
  const roots = scope.includeDataLibrary
    ? ["librarylibrarydatadat", ...(scope.libraryCollections ?? [])]
    : (scope.libraryCollections ?? []);
  const selected = new Set<string>();
  for (const root of roots) {
    const found = [...collectionById.values()].find(
      (item) => item.entity_id === root || item.id === Number(root),
    );
    if (!found || found.type !== "library-data") {
      throw new Error(
        `Data library collection ${root} is absent from repository representations.`,
      );
    }
    selected.add(String(found.entity_id));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const collection of collectionById.values()) {
      const id = String(collection.entity_id);
      if (!selected.has(id) && selected.has(String(collection.parent_id))) {
        selected.add(id);
        changed = true;
      }
    }
  }
  return sources.filter(({ document }) => {
    const meta = document["serdes/meta"];
    if (meta.at(-1)?.model !== "Table" || meta[0]?.model !== "Database") {
      return false;
    }
    return scope.database
      ? meta[0].id === scope.database
      : document.is_published === true &&
          selected.has(String(document.collection_id));
  });
}

function key(name: string, id: number): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const result = words
    .map((word, index) =>
      index
        ? word[0].toUpperCase() + word.slice(1)
        : word[0].toLowerCase() + word.slice(1),
    )
    .join("");
  return result || `entity${id}`;
}

function keyed<T extends { key: string; id: number }>(
  items: T[],
): Record<string, Omit<T, "key">> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  }
  const candidates = items.map((item) =>
    counts.get(item.key) === 1 ? item.key : `${item.key}${item.id}`,
  );
  const candidateCounts = new Map<string, number>();
  for (const candidate of candidates) {
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }
  return Object.fromEntries(
    items.map((item, index) => {
      const { key: _base, ...value } = item;
      const candidate = candidates[index];
      return [
        candidateCounts.get(candidate) === 1
          ? candidate
          : `${candidate}${item.id}`,
        value,
      ];
    }),
  );
}

function jsType(type?: string): string {
  if (!type) {
    return "unknown";
  }
  if (/Boolean/.test(type)) {
    return "boolean";
  }
  if (/(Integer|Float|Decimal|Number|BigInteger)/.test(type)) {
    return "number";
  }
  if (/(Date|Time|Temporal)/.test(type)) {
    return "Date";
  }
  if (/(Text|String|UUID|Char)/.test(type)) {
    return "string";
  }
  return "unknown";
}

function infer(
  expression: unknown,
  measureTypes: Map<string, string>,
  resolveField: (reference: unknown) => Field | undefined,
): string {
  if (!Array.isArray(expression) || typeof expression[0] !== "string") {
    return "unknown";
  }
  const [operator, , ...args] = expression;
  if (["count", "distinct", "count-where", "cum-count"].includes(operator)) {
    return "number";
  }
  if (operator === "field") {
    const reference = args[0];
    const field = resolveField(reference);
    return jsType(field?.effective_type ?? field?.base_type);
  }
  if (operator === "measure") {
    return measureTypes.get(String(args[0])) ?? "unknown";
  }
  if (["min", "max"].includes(operator)) {
    return infer(args[0], measureTypes, resolveField);
  }
  if (
    ["sum", "avg", "median", "stddev", "variance", "+", "-", "*", "/"].includes(
      operator,
    )
  ) {
    return args.length > 0 &&
      args.every(
        (arg) =>
          typeof arg === "number" ||
          infer(arg, measureTypes, resolveField) === "number",
      )
      ? "number"
      : "unknown";
  }
  return "unknown";
}

function measureExpression(document: Document): unknown {
  const definition = document.definition;
  if (!isRecord(definition) || !Array.isArray(definition.stages)) {
    throw new Error("measure definition has no stages");
  }
  const stage = definition.stages.at(-1);
  if (
    !isRecord(stage) ||
    !Array.isArray(stage.aggregation) ||
    stage.aggregation.length !== 1
  ) {
    throw new Error("measure definition must have one aggregation");
  }
  return stage.aggregation[0];
}

async function request<T>(
  origin: string,
  apiKey: string,
  route: string,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(`api/${route}`, `${origin.replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    ...init,
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `${route}: Metabase returned ${response.status}: ${await response.text()}`,
    );
  }
  return await response.json();
}

async function fetchMetadata(
  origin: string,
  apiKey: string,
  selected: Source[],
  requestedDatabaseId?: number,
): Promise<Metadata[]> {
  const response = await request<{
    data: Array<{ id: number; name: string }>;
  }>(origin, apiKey, "database");
  const databases = response.data;
  const groups = new Map<number, Array<[string | null, string]>>();
  for (const { document, file } of selected) {
    const meta = document["serdes/meta"];
    const matches = databases.filter(
      (candidate) =>
        candidate.name === meta[0].id &&
        (!requestedDatabaseId || candidate.id === requestedDatabaseId),
    );
    if (matches.length === 0) {
      throw new Error(`${file}: database ${meta[0].id} is unavailable.`);
    }
    for (const match of matches) {
      const selectors = groups.get(match.id) ?? [];
      selectors.push([schemaName(meta), meta.at(-1)!.id]);
      groups.set(match.id, selectors);
    }
  }
  const result: Metadata[] = [];
  for (const [id, selectors] of groups) {
    const tables: Table[] = [];
    for (let start = 0; start < selectors.length; start += 100) {
      const selector = encodeURIComponent(
        JSON.stringify(selectors.slice(start, start + 100)),
      );
      const metadata = await request<Metadata>(
        origin,
        apiKey,
        `database/${id}/metadata?compact=true&table_selector=${selector}`,
      );
      tables.push(...metadata.tables);
    }
    const database = databases.find((item) => item.id === id)!;
    result.push({ id, name: database.name, tables });
  }
  return result;
}

function snapshotPath(appRoot: string): string {
  return path.join(
    appRoot,
    "node_modules",
    ".cache",
    "metabase-schema-metadata.json",
  );
}

async function metadata(
  options: Options,
  selected: Source[],
  origin: string,
  apiKey: string,
): Promise<Metadata[]> {
  const file = snapshotPath(options.appRoot);
  const authHash = createHash("sha256").update(apiKey).digest("hex");
  const scopeKey = JSON.stringify({
    database: options.database,
    collections: [...(options.libraryCollections ?? [])].sort(),
    includeDataLibrary: options.includeDataLibrary ?? false,
  });
  const requestedDatabaseId =
    options.database && /^\d+$/.test(options.database)
      ? Number(options.database)
      : undefined;
  const previous: Snapshot | null = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : null;
  const coverage = selected.every(({ document }) =>
    previous?.databases.some(
      (database) =>
        database.name === document["serdes/meta"][0].id &&
        (!requestedDatabaseId || database.id === requestedDatabaseId) &&
        database.tables.some(
          (table) =>
            table.name === document["serdes/meta"].at(-1)?.id &&
            (table.schema || null) === schemaName(document["serdes/meta"]),
        ),
    ),
  );
  if (
    !options.forceRefresh &&
    previous?.version === 1 &&
    previous.origin === origin &&
    previous.authHash === authHash &&
    previous.scopeKey === scopeKey &&
    Date.now() - previous.fetchedAt <= (options.maxAgeMinutes ?? 60) * 60_000 &&
    coverage
  ) {
    return requestedDatabaseId
      ? previous.databases.filter(
          (database) => database.id === requestedDatabaseId,
        )
      : previous.databases;
  }
  const databases = await fetchMetadata(
    origin,
    apiKey,
    selected,
    requestedDatabaseId,
  );
  if (
    !selected.every(({ document }) =>
      databases.some(
        (database) =>
          database.name === document["serdes/meta"][0].id &&
          database.tables.some(
            (table) =>
              table.name === document["serdes/meta"].at(-1)?.id &&
              (table.schema || null) === schemaName(document["serdes/meta"]),
          ),
      ),
    )
  ) {
    throw new Error(
      "Compact metadata does not cover every selected repository table.",
    );
  }
  const snapshot: Snapshot = {
    version: 1,
    fetchedAt: Date.now(),
    origin,
    authHash,
    scopeKey,
    databases,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(snapshot));
  fs.renameSync(temporary, file);
  return databases;
}

async function translations(
  origin: string,
  apiKey: string,
  entities: Source[],
): Promise<Map<string, number>> {
  const byModel: Record<string, string[]> = { segment: [], measure: [] };
  for (const { document } of entities) {
    const meta = document["serdes/meta"].at(-1)!;
    byModel[meta.model.toLowerCase()].push(meta.id);
  }
  if (!entities.length) {
    return new Map();
  }
  const response = await request<{
    entity_ids: Record<string, { status: string; id?: number }>;
  }>(origin, apiKey, "eid-translation/translate", {
    method: "POST",
    body: JSON.stringify({ entity_ids: byModel }),
  });
  const result = new Map<string, number>();
  for (const { document, file } of entities) {
    const id = document["serdes/meta"].at(-1)!.id;
    const translated = response.entity_ids[id];
    if (translated?.status !== "ok" || !translated.id) {
      throw new Error(
        `${file}: ${id}: ${translated?.status ?? "missing translation"}`,
      );
    }
    result.set(id, translated.id);
  }
  return result;
}

function render(
  selected: Source[],
  sources: Source[],
  databases: Metadata[],
  ids: Map<string, number>,
  origin: string,
): string {
  const entities = sources.filter(({ document }) =>
    ["Segment", "Measure"].includes(
      document["serdes/meta"].at(-1)?.model ?? "",
    ),
  );
  const tables = selected.flatMap(({ document, file }) => {
    const meta = document["serdes/meta"];
    const matches = databases
      .filter((database) => database.name === meta[0].id)
      .flatMap((database) =>
        database.tables
          .filter(
            (table) =>
              table.name === meta.at(-1)?.id &&
              (table.schema || null) === schemaName(meta),
          )
          .map((table) => table),
      );
    if (!matches.length) {
      throw new Error(`${file}: table ${identity(meta)} is unavailable.`);
    }
    return matches.map((table) => {
      const fieldById = new Map(table.fields.map((field) => [field.id, field]));
      const fieldPath = (field: Field): string[] => {
        const parent = field.parent_id
          ? fieldById.get(field.parent_id)
          : undefined;
        return parent ? [...fieldPath(parent), field.name] : [field.name];
      };
      const resolveField = (reference: unknown): Field | undefined => {
        if (typeof reference === "number") {
          return fieldById.get(reference);
        }
        const normalized = normalizePath(reference);
        if (!Array.isArray(normalized)) {
          return undefined;
        }
        const prefix = tablePath(meta);
        if (
          normalized.length <= prefix.length ||
          !prefix.every((part, index) => part === normalized[index])
        ) {
          return undefined;
        }
        const name = normalized.slice(prefix.length).join("/");
        return table.fields.find(
          (field) => fieldPath(field).join("/") === name,
        );
      };
      const validateReferences = (value: unknown, sourceFile: string): void => {
        if (Array.isArray(value)) {
          if (value[0] === "field" && !resolveField(value[2])) {
            throw new Error(
              `${sourceFile}: unresolved field reference ${JSON.stringify(value[2])}`,
            );
          }
          if (
            (value[0] === "measure" || value[0] === "segment") &&
            !ids.has(String(value[2]))
          ) {
            throw new Error(
              `${sourceFile}: unresolved ${value[0]} reference ${JSON.stringify(value[2])}`,
            );
          }
          value.forEach((part) => validateReferences(part, sourceFile));
        } else if (isRecord(value)) {
          if (Object.hasOwn(value, "source-table")) {
            const reference = normalizePath(value["source-table"]);
            const expected = tablePath(meta);
            if (
              !Array.isArray(reference) ||
              reference.length !== expected.length ||
              !expected.every((part, index) => part === reference[index])
            ) {
              throw new Error(
                `${sourceFile}: unresolved source-table reference ${JSON.stringify(reference)}`,
              );
            }
          }
          if (Object.hasOwn(value, "source-card")) {
            throw new Error(
              `${sourceFile}: saved-question sources are outside repository schema V1.`,
            );
          }
          Object.values(value).forEach((part) =>
            validateReferences(part, sourceFile),
          );
        }
      };
      const keyedFields = keyed(
        table.fields.map((field) => ({
          key: key(field.name, field.id),
          id: field.id,
          type: "column",
          name: field.name,
          sourceName: table.name,
          jsType: jsType(field.effective_type ?? field.base_type),
          fieldId: field.id,
          tableId: table.id,
          baseType: field.base_type,
          effectiveType: field.effective_type,
        })),
      );
      const fields = Object.fromEntries(
        Object.entries(keyedFields).map(([fieldKey, { id: _id, ...field }]) => [
          fieldKey,
          field,
        ]),
      );
      const members = entities.filter(({ document: entity }) => {
        return (
          JSON.stringify(sourceTablePath(entity)) ===
          JSON.stringify(tablePath(meta))
        );
      });
      const measureTypes = new Map<string, string>();
      const segments = keyed(
        members
          .filter(
            ({ document: entity }) =>
              entity["serdes/meta"].at(-1)?.model === "Segment",
          )
          .map(({ document: entity, file: segmentFile }) => {
            validateReferences(entity.definition, segmentFile);
            const id = ids.get(entity["serdes/meta"].at(-1)!.id)!;
            return {
              key: key(String(entity.name ?? ""), id),
              id,
              type: "segment",
              tableId: table.id,
              name: entity.name,
            };
          }),
      );
      const measures = keyed(
        members
          .filter(
            ({ document: entity }) =>
              entity["serdes/meta"].at(-1)?.model === "Measure",
          )
          .map(({ document: entity, file: measureFile }) => {
            const id = ids.get(entity["serdes/meta"].at(-1)!.id)!;
            const expression = measureExpression(entity);
            validateReferences(entity.definition, measureFile);
            const operand = JSON.stringify(expression);
            const type = infer(expression, measureTypes, resolveField);
            if (type === "unknown") {
              process.stderr.write(
                `${measureFile}: cannot infer ${String(entity.name)} from ${operand}\n`,
              );
            }
            measureTypes.set(entity["serdes/meta"].at(-1)!.id, type);
            const name = String(entity.name ?? "");
            const columnName =
              Array.isArray(expression) && typeof expression[0] === "string"
                ? expression[0]
                : name;
            return {
              key: key(name, id),
              id,
              type: "measure",
              tableId: table.id,
              name,
              columns: [{ type: "column", name: columnName, jsType: type }],
            };
          }),
      );
      return {
        key: key(String(document.display_name ?? table.name), table.id),
        id: table.id,
        type: "table",
        name: document.display_name ?? table.name,
        fields,
        ...(Object.keys(segments).length ? { segments } : {}),
        ...(Object.keys(measures).length ? { measures } : {}),
      };
    });
  });
  return `const models = {} as const;\n\nconst tables = ${JSON.stringify(keyed(tables), null, 2)} as const;\n\nconst metrics = {} as const;\n\nconst schema = { schemaVersion: 2, generatedAt: ${JSON.stringify(new Date().toISOString())}, metabase: { instanceUrl: ${JSON.stringify(origin)} }, models, tables, metrics } as const;\n\nexport default schema;\n`;
}

export async function repositorySchemaAction(
  options: Options,
  refreshOnly = false,
): Promise<void> {
  if (
    options.maxAgeMinutes !== undefined &&
    (!Number.isFinite(options.maxAgeMinutes) || options.maxAgeMinutes < 0)
  ) {
    throw new Error("--max-age-minutes must be a non-negative number.");
  }
  const appRoot = path.resolve(options.appRoot);
  const root = options.repositoryRoot
    ? path.resolve(options.repositoryRoot)
    : findRepositoryRoot(appRoot);
  const { sources, yamlFileCount } = readRepository(root);
  const { metabaseUrl, apiKey } = getResourceSyncCredentials(appRoot);
  const origin = new URL(metabaseUrl).toString().replace(/\/$/, "");
  const database =
    options.database && /^\d+$/.test(options.database)
      ? await request<{ name: string }>(
          origin,
          apiKey,
          `database/${options.database}`,
        )
      : undefined;
  const libraryCollections = await Promise.all(
    (options.libraryCollections ?? []).map(async (collection) => {
      if (!/^\d+$/.test(collection)) {
        return collection;
      }
      const resolved = await request<{ entity_id: string }>(
        origin,
        apiKey,
        `collection/${collection}`,
      );
      return resolved.entity_id;
    }),
  );
  const selected = selectTables(sources, {
    ...options,
    database: database?.name ?? options.database,
    libraryCollections,
  });
  if (selected.length === 0) {
    const scope = options.database
      ? `database ${options.database}`
      : options.includeDataLibrary
        ? "Data library"
        : `Data library collections ${libraryCollections.join(", ")}`;
    throw new Error(
      `Repository scope ${scope} selected 0 tables after scanning ${yamlFileCount} YAML files.`,
    );
  }
  const databases = await metadata(
    { ...options, appRoot, forceRefresh: refreshOnly || options.forceRefresh },
    selected,
    origin,
    apiKey,
  );
  if (refreshOnly) {
    return;
  }
  const selectedIds = new Set(
    selected.map(({ document }) =>
      JSON.stringify(tablePath(document["serdes/meta"])),
    ),
  );
  const entities = sources.filter(
    ({ document }) =>
      ["Segment", "Measure"].includes(
        document["serdes/meta"].at(-1)?.model ?? "",
      ) && selectedIds.has(JSON.stringify(sourceTablePath(document))),
  );
  const ids = await translations(origin, apiKey, entities);
  const output = render(selected, sources, databases, ids, origin);
  const target = path.join(appRoot, "src", "metabase.data.ts");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, output);
  fs.renameSync(temporary, target);
}
