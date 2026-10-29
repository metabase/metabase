import { Api } from "metabase/api";
import { TAG_TYPES, type TagType } from "metabase/api/tags";

type Tag = { type: string; id?: unknown };
type TagList = readonly (string | Tag | null | undefined)[];
type TagSource =
  | TagList
  | ((result: unknown, error: unknown, arg: unknown) => TagList);

type EndpointDefinition = {
  type: "query" | "mutation";
  providesTags?: TagSource;
  invalidatesTags?: TagSource;
};

type Endpoint = {
  name: string;
  verb: string;
  entity: TagType | undefined;
  definition: EndpointDefinition;
};

type EntityEndpoint = Endpoint & { entity: TagType };

type SampleTags = { tags: Tag[]; error?: string };

type CachedQuery = { name: string; forList: SampleTags; forItem: SampleTags };

type ProvidedTags = { name: string; tags: Tag[] };

type Unchecked = { name: string; reason: string };

const CHANGE_VERBS = ["create", "update", "delete", "revert"];

// Endpoints whose name doesn't end in the tag type they change.
const ENTITY_OVERRIDES: Partial<Record<string, TagType>> = {
  updatePassword: "user",
};

const ITEM_ID = 1;
// Item endpoints read these nested lists, some of them without checking they exist.
// A database result with `tables` also provides the table list tag.
const item = { id: ITEM_ID, dashcards: [], members: [], tables: [] };
// Endpoints take either the id or an object with an id, so the sample argument is both.
const itemArg = Object.assign(new Number(ITEM_ID), { id: ITEM_ID });
// List endpoints return their items bare or under one of these keys.
const emptyList = Object.assign([], {
  data: [],
  comments: [],
  indexes: [],
  metrics: [],
});

const KNOWN_GAPS: Record<string, string[]> = {
  updateTable: [
    "listDatabaseSchemaTables",
    "listVirtualDatabaseTables",
    "listAutocompleteSuggestions",
    "listTables",
  ],
  deleteTransformJob: ["getTransformJob"],
};

const LISTS_WITHOUT_LIST_TAG: Record<string, string> = {
  listCacheConfigs: "cached under the bare cache-config tag",
  listEmbeddableCards: "cached under embed-card",
  listEmbeddableDashboards: "cached under embed-dashboard",
  listCollectionDashboardQuestionCandidates: "cached under the collection id",
  listDagTransforms: "cached under the transform id",
  listDagRunTransformRuns: "cached under the DAG run id",
  listJobRunTransformRuns: "cached under the job id",
};

const endpoints = readEndpoints();
const queries = endpoints.filter(
  ({ definition }) => definition.type === "query",
);
const mutations = endpoints.filter(
  ({ definition }) => definition.type === "mutation",
);
const cachedQueries = queries.map(readCachedQuery);
const changes = mutations
  .filter(hasEntity)
  .filter(({ verb }) => CHANGE_VERBS.includes(verb));
const lists = queries
  .filter(hasEntity)
  .filter(
    ({ name, verb }) => verb === "list" && !(name in LISTS_WITHOUT_LIST_TAG),
  );
const knownGaps = Object.entries(KNOWN_GAPS).flatMap(([mutation, names]) =>
  names.map((query) => ({ mutation, query })),
);

describe("cache tag invalidation", () => {
  it.each(changes)(
    "$name should invalidate every cached $entity query",
    (change) => {
      const unreached = unreachedQueries(change)
        .filter((query) => !KNOWN_GAPS[change.name]?.includes(query.name))
        .map((query) => describeQuery(query, change.entity));

      expect([...new Set(unreached)]).toEqual([]);
    },
  );

  it.each(lists)(
    "$name should provide the $entity list tag",
    ({ entity, definition }) => {
      const { tags, error } = readProvidedTags(definition, emptyList);

      expect(error).toBeUndefined();
      expect(tags).toContainEqual({ type: entity, id: "LIST" });
    },
  );

  describe("known gaps", () => {
    it.each(knownGaps)(
      "$mutation leaves $query stale",
      ({ mutation, query }) => {
        const change = changes.find(({ name }) => name === mutation);
        const unreached = change ? unreachedQueries(change) : [];

        expect(unreached.map(({ name }) => name)).toContain(query);
      },
    );
  });

  describe("mutations not checked", () => {
    uncheckedMutations().forEach(({ name, reason }) =>
      it.todo(`${name} ${reason}`),
    );
  });

  describe("list tags not checked", () => {
    uncheckedLists().forEach(({ name, reason }) =>
      it.todo(`${name} ${reason}`),
    );
  });

  describe("tags not checked", () => {
    uncheckedTags().forEach(({ name, reason }) => it.todo(`${name} ${reason}`));
  });
});

function readEndpoints(): Endpoint[] {
  const definitions = new Map<string, EndpointDefinition>();
  Api.enhanceEndpoints({
    endpoints: Object.fromEntries(
      Object.keys(Api.endpoints).map((name) => [
        name,
        (definition: EndpointDefinition) => definitions.set(name, definition),
      ]),
    ),
  });
  return Array.from(definitions, ([name, definition]) => {
    const [verb, ...nounWords] = name
      .split(/(?=[A-Z])/)
      .map((word) => word.toLowerCase());
    const entity = ENTITY_OVERRIDES[name] ?? entityOf(nounWords);
    return { name, verb, entity, definition };
  });
}

function entityOf(nounWords: string[]): TagType | undefined {
  for (let start = 0; start < nounWords.length; start++) {
    const words = nounWords.slice(start);
    const last = words[words.length - 1];
    const forms = [last, singular(last), `${last}s`].map((form) =>
      [...words.slice(0, -1), form].join("-"),
    );
    const entity = forms.find(isTagType);
    if (entity) {
      return entity;
    }
  }
  return undefined;
}

function singular(word: string): string {
  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }
  if (/(x|ch|sh|ss)es$/.test(word)) {
    return word.slice(0, -2);
  }
  return word.replace(/s$/, "");
}

function hasEntity(endpoint: Endpoint): endpoint is EntityEndpoint {
  return endpoint.entity !== undefined;
}

function isTagType(value: string): value is TagType {
  return TAG_TYPES.some((type) => type === value);
}

function evaluate(source: TagSource | undefined, result: unknown): Tag[] {
  if (source === undefined) {
    return [];
  }
  const tags =
    typeof source === "function" ? source(result, undefined, itemArg) : source;
  return tags.flatMap((tag) =>
    tag == null ? [] : [typeof tag === "string" ? { type: tag } : tag],
  );
}

function readCachedQuery({ name, definition }: Endpoint): CachedQuery {
  return {
    name,
    forList: readProvidedTags(definition, emptyList),
    forItem: readProvidedTags(definition, item),
  };
}

function readProvidedTags(
  query: EndpointDefinition,
  result: unknown,
): SampleTags {
  try {
    return { tags: evaluate(query.providesTags, result) };
  } catch (error) {
    return { tags: [], error: String(error) };
  }
}

function unreachedQueries({
  verb,
  entity,
  definition,
}: EntityEndpoint): ProvidedTags[] {
  // RTK matches a tag with an undefined id against every tag of its type.
  // Here the id is only undefined because the samples don't carry it, so the tag can't count as a match.
  const invalidated = evaluate(definition.invalidatesTags, item).filter(
    (tag) => !isUnkeyed(tag),
  );
  return queriesCaching(entity, verb).filter(
    ({ tags }) => !reaches(invalidated, tags),
  );
}

function queriesCaching(entity: TagType, verb: string): ProvidedTags[] {
  const isListTag = (tag: Tag) => tag.type === entity && tag.id === "LIST";
  const isItemTag = (tag: Tag) =>
    tag.type === entity && String(tag.id) === String(ITEM_ID);
  return cachedQueries.flatMap(({ name, forList, forItem }) => [
    ...(forList.tags.some(isListTag) ? [{ name, tags: forList.tags }] : []),
    ...(forItem.tags.some(
      (tag) => isListTag(tag) || (verb !== "create" && isItemTag(tag)),
    )
      ? [{ name, tags: forItem.tags }]
      : []),
  ]);
}

function reaches(invalidated: Tag[], provided: Tag[]): boolean {
  return invalidated.some((invalidatedTag) =>
    provided.some(
      (providedTag) =>
        invalidatedTag.type === providedTag.type &&
        (invalidatedTag.id === undefined ||
          (providedTag.id !== undefined &&
            String(invalidatedTag.id) === String(providedTag.id))),
    ),
  );
}

function isUnkeyed(tag: Tag): boolean {
  return "id" in tag && (tag.id === undefined || tag.id === null);
}

function uncheckedMutations(): Unchecked[] {
  return mutations.flatMap(({ name, verb, entity }) => {
    if (!CHANGE_VERBS.includes(verb)) {
      return [
        {
          name,
          reason: `starts with ${verb}, which isn't one of ${CHANGE_VERBS.join(", ")}`,
        },
      ];
    }
    if (entity === undefined) {
      return [{ name, reason: "has no tag type at the end of its name" }];
    }
    return [];
  });
}

function uncheckedLists(): Unchecked[] {
  return queries
    .filter(({ verb }) => verb === "list")
    .flatMap(({ name, entity }) => {
      if (name in LISTS_WITHOUT_LIST_TAG) {
        return [{ name, reason: `is ${LISTS_WITHOUT_LIST_TAG[name]}` }];
      }
      if (entity === undefined) {
        return [{ name, reason: "has no tag type at the end of its name" }];
      }
      return [];
    });
}

function uncheckedTags(): Unchecked[] {
  const unreadQueries = cachedQueries.flatMap(({ name, forList, forItem }) => {
    if (forList.error && forItem.error) {
      return [
        { name, reason: `throws on both sample results: ${forItem.error}` },
      ];
    }
    const unkeyed = forItem.tags.filter(isUnkeyed);
    return unkeyed.length > 0
      ? [
          {
            name,
            reason: `provides ${describeTags(unkeyed)} for the sample item`,
          },
        ]
      : [];
  });
  const unkeyedChanges = changes.flatMap(({ name, definition }) => {
    const unkeyed = evaluate(definition.invalidatesTags, item).filter(
      isUnkeyed,
    );
    return unkeyed.length > 0
      ? [
          {
            name,
            reason: `invalidates ${describeTags(unkeyed)} for the sample item`,
          },
        ]
      : [];
  });
  return [...unreadQueries, ...unkeyedChanges];
}

function describeTags(tags: Tag[]): string {
  const described = tags.map((tag) => `${tag.type}/${String(tag.id)}`);
  return [...new Set(described)].join(", ");
}

function describeQuery({ name, tags }: ProvidedTags, entity: TagType): string {
  const entityTags = tags.filter((tag) => tag.type === entity);
  return `${name} provides ${describeTags(entityTags)}`;
}
