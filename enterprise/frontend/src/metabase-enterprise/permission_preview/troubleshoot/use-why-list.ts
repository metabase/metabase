import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

import {
  type ItemDependencies,
  type PermissionDebugRequest,
  type PermissionDebugResponse,
  type PreviewCollection,
  type PreviewCollectionsResponse,
  type PreviewDataResponse,
  type PreviewDatabase,
  type PreviewTableAccess,
  type Principal,
  useDebugPermissionsQuery,
  useGetCollectionsPreviewQuery,
  useGetDataPreviewQuery,
  useGetItemDependenciesQuery,
} from "../api";

import { type WhyTarget, getSourceGroupName } from "./WhySidesheet";
import type { OpenedItem } from "./item-path";
import type { PreviewColumn } from "./preview-options";

/** The answer "Explain access" leads with; `partial` is an item that opens with some of its data blocked. */
export type WhyVerdict = {
  kind: "allowed" | "filtered" | "partial" | "blocked" | "unknown";
  text: string;
  /** The group the access comes from, shown on its own line under the sentence. */
  group?: string;
  /** Why the verdict holds, shown with it: why an item doesn't open, or what gives a collection access with no group. */
  reason?: string;
};

export type ItemType = "dashboard" | "question" | "model" | "metric";

/** A dashboard or question: its collection, its data, exploring it, and every permission on it. */
export type ItemWhyPage = {
  kind: "item";
  itemType: ItemType;
  name: string;
  verdict: WhyVerdict;
  /** A dashboard's cards that can't load, each with the blocked tables that stop it. */
  blockedCards: BlockedCard[];
  /** One View data row per table under row security. */
  filtered: WhyTarget[];
  /** The item's collection, which decides whether it opens. */
  collection: WhyTarget | null;
  /** View data on each table the item uses: blocked tables first, then those under row security, then the rest. */
  tables: WhyTarget[];
  /** Create queries on the same tables, in the same order. */
  explore: WhyTarget[];
  /** The collection, then each table's View data and Create queries. */
  permissions: WhyTarget[];
};

export type BlockedCard = {
  name: string;
  /** Its blocked tables, as View data rows of the item's tables. */
  tables: WhyTarget[];
};

/** A collection: whether the person can open it, and from which group; on Our analytics, also the collections in it. */
export type CollectionWhyPage = {
  kind: "collection";
  name: string | null;
  verdict: WhyVerdict;
  /** The collection's own access, which the verdict's status opens; null when no collection permission applies. */
  target: WhyTarget | null;
  /** The collections the frame lists on this page: only Our analytics lists them here. */
  collections: WhyTarget[];
};

/** The frame's collection browser at its top: the collections it lists, each with its access. */
export type AllCollectionsWhyPage = {
  kind: "all-collections";
  collections: WhyTarget[];
};

/** The person's whole access: what's blocked and filtered, then counts of what they can open. */
export type SummaryWhyPage = {
  kind: "summary";
  verdict: WhyVerdict;
  blocked: WhyTarget[];
  filtered: WhyTarget[];
  collections: WhyTarget[];
  tables: WhyTarget[];
};

/** What "Explain access" shows: the page open (null when no item is), and the whole-access summary. */
export type WhyList = {
  page: ItemWhyPage | CollectionWhyPage | AllCollectionsWhyPage | null;
  summary: SummaryWhyPage;
};

/** The preview being explained: the user it runs as, and the attribute values and unsaved edits it runs with. */
export type WhyPreview = {
  userId: number;
  previewId?: string;
  unsavedEditsId?: string;
};

/**
 * What "Explain access" says about the item open in the frame, and about the person's whole access. Whether the item
 * opens and whether its data loads come from Metabase's own permission checks, run as the user the preview runs as;
 * the groups behind each answer come from the permissions graph, with the preview's attribute values. `null` while
 * loading. All of it is read as the admin, so it works in a "View app as…" tab too. `isAllCollections` says the frame
 * shows its collection browser's top, where no item is open.
 */
export function useWhyList(
  preview: WhyPreview | null,
  item: OpenedItem | null,
  who: string,
  isAllCollections = false,
): WhyList | null {
  const principal: Principal | null =
    preview != null ? { type: "user", id: preview.userId } : null;
  const { data: mainCollections } = useGetCollectionsPreviewQuery(
    principal != null ? { principal, namespace: "default" } : skipToken,
  );
  const { data: sharedCollections } = useGetCollectionsPreviewQuery(
    principal != null ? { principal, namespace: "shared" } : skipToken,
  );
  const { data: tenantCollections } = useGetCollectionsPreviewQuery(
    principal != null ? { principal, namespace: "tenant" } : skipToken,
  );
  const { data: dataPreview } = useGetDataPreviewQuery(
    preview != null
      ? {
          type: "user",
          id: preview.userId,
          previewId: preview.previewId,
          unsavedEditsId: preview.unsavedEditsId,
        }
      : skipToken,
  );
  const { data: dependencies } = useGetItemDependenciesQuery(
    item?.type === "card"
      ? { cardId: item.id }
      : item?.type === "dashboard"
        ? { dashboardId: item.id }
        : skipToken,
  );
  const { data: readCheck } = useDebugPermissionsQuery(
    getCheckRequest(preview, item, "read") ?? skipToken,
  );
  const { data: queryCheck } = useDebugPermissionsQuery(
    getCheckRequest(preview, item, "query") ?? skipToken,
  );

  if (
    mainCollections == null ||
    sharedCollections == null ||
    tenantCollections == null ||
    dataPreview == null
  ) {
    return null;
  }
  const collections: CollectionLists = {
    main: mainCollections,
    shared: sharedCollections,
    tenant: tenantCollections,
    all: [mainCollections, sharedCollections, tenantCollections].flatMap(
      (list) => list.collections,
    ),
  };
  const summary = getSummaryPage(who, collections, dataPreview);
  if (item == null) {
    return {
      page: isAllCollections
        ? {
            kind: "all-collections",
            collections: getAllCollectionsList(collections).map((collection) =>
              getCollectionWhyTarget(who, collection),
            ),
          }
        : null,
      summary,
    };
  }
  if (item.type === "collection") {
    if (item.id != null && readCheck == null) {
      return null;
    }
    return {
      page: getCollectionPage(who, collections, item.id, readCheck ?? null),
      summary,
    };
  }
  if (dependencies == null || readCheck == null || queryCheck == null) {
    return null;
  }
  return {
    page: getItemPage(
      who,
      item,
      dependencies,
      collections,
      dataPreview,
      readCheck,
      queryCheck,
    ),
    summary,
  };
}

/** Each tab's collections, and all of them together; the main tab holds the root collection. */
type CollectionLists = {
  main: PreviewCollectionsResponse;
  shared: PreviewCollectionsResponse;
  tenant: PreviewCollectionsResponse;
  all: PreviewCollection[];
};

/**
 * What the frame's "All collections" lists, in its order (`use-all-collections-items.ts`): Our analytics, or the
 * collections in it the person can open when they can't open it; the top shared collections; their own tenant's
 * collection; their personal collection. Only those the person can open.
 */
function getAllCollectionsList({
  main,
  shared,
  tenant,
}: CollectionLists): PreviewCollection[] {
  const mainCollections = main.collections;
  const root = mainCollections.find(({ id }) => id === "root");
  const ourAnalytics =
    root == null
      ? []
      : canOpen(root)
        ? [root]
        : getChildCollections(mainCollections);
  const sharedCollections = shared.applies
    ? getChildCollections(shared.collections)
    : [];
  const tenantCollections = tenant.applies
    ? tenant.collections.filter(
        (collection) =>
          collection.source === "tenant" &&
          collection.depth === 0 &&
          canOpen(collection),
      )
    : [];
  const personalCollections = mainCollections.filter(
    ({ source }) => source === "personal",
  );
  return [
    ...ourAnalytics,
    ...sharedCollections,
    ...tenantCollections,
    ...personalCollections,
  ];
}

/** The collections right under a tab's root that the person can open. */
function getChildCollections(collections: PreviewCollection[]) {
  return collections.filter(
    (collection) => collection.depth === 1 && canOpen(collection),
  );
}

function canOpen(collection: PreviewCollection) {
  return collection.access.value !== "none";
}

/** The check that answers whether the item opens (`read`) or whether its data loads (`query`); a collection has no query. */
function getCheckRequest(
  preview: WhyPreview | null,
  item: OpenedItem | null,
  check: "read" | "query",
): PermissionDebugRequest | null {
  if (preview == null || item == null || item.id == null) {
    return null;
  }
  if (item.type === "collection") {
    return check === "read"
      ? {
          userId: preview.userId,
          modelId: item.id,
          actionType: "collection/read",
        }
      : null;
  }
  return {
    userId: preview.userId,
    modelId: item.id,
    actionType: `${item.type}/${check}`,
  };
}

function getSummaryPage(
  who: string,
  collections: CollectionLists,
  dataPreview: PreviewDataResponse,
): SummaryWhyPage {
  // the frame never shows a tenant user other tenants' collections
  const collectionTargets = collections.all
    .filter(({ source }) => source !== "other-tenant")
    .map((collection) => getCollectionWhyTarget(who, collection));
  const tableTargets = dataPreview.databases.flatMap((database) =>
    database.tables.map((table) =>
      getTableWhyTarget(who, database, table, "view_data"),
    ),
  );
  const blocked = [...collectionTargets, ...tableTargets].filter(isBlocking);
  const filtered = tableTargets.filter(isFiltered);
  const openCollections = collectionTargets.filter(
    (target) => !isBlocking(target),
  );
  const viewableTables = tableTargets.filter((target) => !isBlocking(target));
  const collectionCount = ngettext(
    msgid`${openCollections.length} collection`,
    `${openCollections.length} collections`,
    openCollections.length,
  );
  const tableCount = ngettext(
    msgid`${viewableTables.length} table`,
    `${viewableTables.length} tables`,
    viewableTables.length,
  );
  return {
    kind: "summary",
    verdict: {
      kind:
        blocked.length > 0
          ? "partial"
          : filtered.length > 0
            ? "filtered"
            : "allowed",
      text: t`${who} can open ${collectionCount} and view ${tableCount}.`,
    },
    blocked,
    filtered,
    collections: openCollections,
    tables: viewableTables,
  };
}

/**
 * A collection's own sheet; the root collection has no check of its own, so its main-tab value answers, and it lists
 * the collections in it, as the frame does.
 */
function getCollectionPage(
  who: string,
  collections: CollectionLists,
  collectionId: CollectionId | null,
  readCheck: PermissionDebugResponse | null,
): CollectionWhyPage {
  const target = getCollectionTarget(who, collections, collectionId);
  if (target == null && readCheck == null) {
    return {
      kind: "collection",
      name: null,
      verdict: {
        kind: "unknown",
        text: t`No collection permissions apply to this page.`,
      },
      target: null,
      collections: [],
    };
  }
  const canOpenCollection =
    readCheck != null
      ? readCheck.decision === "allow"
      : target != null && !isBlocking(target);
  const childCollections =
    collectionId == null && collections.main.applies
      ? getChildCollections(collections.main.collections)
      : [];
  return {
    kind: "collection",
    name: target?.subject.value ?? null,
    verdict: getCollectionVerdict(who, canOpenCollection, target),
    target,
    collections: childCollections.map((collection) =>
      getCollectionWhyTarget(who, collection),
    ),
  };
}

function getCollectionVerdict(
  who: string,
  canOpen: boolean,
  target: WhyTarget | null,
): WhyVerdict {
  if (!canOpen) {
    return { kind: "blocked", text: t`${who} can't open this collection.` };
  }
  const group =
    (target != null ? getSourceGroupName(target.cell) : null) ?? undefined;
  return {
    kind: "allowed",
    text:
      target?.cell.value === "write"
        ? t`${who} can curate this collection.`
        : t`${who} can view this collection.`,
    group,
    reason: target?.cell.note ?? undefined,
  };
}

function getItemPage(
  who: string,
  item: Exclude<OpenedItem, { type: "collection" }>,
  dependencies: ItemDependencies,
  collections: CollectionLists,
  dataPreview: PreviewDataResponse,
  readCheck: PermissionDebugResponse,
  queryCheck: PermissionDebugResponse,
): ItemWhyPage {
  const itemType = item.type === "dashboard" ? "dashboard" : item.cardType;
  const collectionTarget = getCollectionTarget(
    who,
    collections,
    dependencies.collection_id,
  );
  const collectionTargets = collectionTarget != null ? [collectionTarget] : [];
  const tables = dataPreview.databases.flatMap((database) =>
    database.tables
      .filter(
        (table) =>
          dependencies.table_ids.includes(table.id) ||
          dependencies.whole_database_ids.includes(database.id),
      )
      .map((table) => ({ database, table })),
  );
  const viewTargets = tables.map(({ database, table }) =>
    getTableWhyTarget(who, database, table, "view_data"),
  );
  const filtered = viewTargets.filter(isFiltered);
  const tablesInOrder = tables
    .map((table, index) => ({ ...table, view: viewTargets[index] }))
    .sort((left, right) => getTableRank(left.view) - getTableRank(right.view));
  return {
    kind: "item",
    itemType,
    name: dependencies.name,
    verdict: getItemVerdict(
      who,
      itemType,
      readCheck,
      queryCheck,
      filtered.length > 0,
      collectionTarget,
    ),
    blockedCards: (queryCheck.data["blocked-cards"] ?? []).map((card) => ({
      name: card.name,
      tables: tablesInOrder
        .filter(
          ({ table, view }) =>
            card.tables.includes(table.name) && isBlocking(view),
        )
        .map(({ view }) => view),
    })),
    filtered,
    collection: collectionTarget,
    tables: tablesInOrder.map(({ view }) => view),
    explore: tablesInOrder.map(({ database, table }) =>
      getTableWhyTarget(who, database, table, "create_queries"),
    ),
    permissions: [
      ...collectionTargets,
      ...tables.flatMap(({ database, table }) => [
        getTableWhyTarget(who, database, table, "view_data"),
        getTableWhyTarget(who, database, table, "create_queries"),
      ]),
    ],
  };
}

/** The tables that limit the person come first: blocked, then under row security, then the rest. */
function getTableRank(target: WhyTarget) {
  return isBlocking(target) ? 0 : target.security != null ? 1 : 2;
}

/**
 * The outcome, with the sections below giving the reasons: whether the item opens (its read check), then whether its
 * data loads (its query check). A question's query stops at one blocked table; a dashboard's cards load one by one.
 * An item that doesn't open says why when its collection is the cause, so the answer leads with it.
 */
function getItemVerdict(
  who: string,
  itemType: ItemType,
  readCheck: PermissionDebugResponse,
  queryCheck: PermissionDebugResponse,
  isFiltered: boolean,
  collection: WhyTarget | null,
): WhyVerdict {
  const copy = getItemVerdictCopy(who, itemType);
  if (readCheck.decision !== "allow") {
    return {
      kind: "blocked",
      text: copy.blocked,
      reason:
        collection != null && isBlocking(collection)
          ? t`${who} has no access to its collection, ${collection.title}.`
          : undefined,
    };
  }
  if (itemType === "dashboard") {
    const cardCount = queryCheck.data["card-count"] ?? 0;
    const blockedCount = queryCheck.data["blocked-card-count"] ?? 0;
    if (blockedCount > 0) {
      return {
        kind: "partial",
        text:
          blockedCount === cardCount
            ? t`${who} can open this dashboard but can't see any of its cards.`
            : ngettext(
                msgid`${who} can open this dashboard but can't see ${blockedCount} of its ${cardCount} card.`,
                `${who} can open this dashboard but can't see ${blockedCount} of its ${cardCount} cards.`,
                cardCount,
              ),
      };
    }
  } else if (queryCheck.decision !== "allow") {
    return { kind: "partial", text: getNoResultsVerdictText(who, itemType) };
  }
  return {
    kind: isFiltered ? "filtered" : "allowed",
    text: copy.allowed,
  };
}

/** One full sentence per kind, so translations can make "this" and the verbs agree with the noun. */
function getItemVerdictCopy(who: string, itemType: ItemType) {
  switch (itemType) {
    case "dashboard":
      return {
        blocked: t`${who} can't open this dashboard.`,
        allowed: t`${who} can see this dashboard.`,
      };
    case "question":
      return {
        blocked: t`${who} can't open this question.`,
        allowed: t`${who} can see this question.`,
      };
    case "model":
      return {
        blocked: t`${who} can't open this model.`,
        allowed: t`${who} can see this model.`,
      };
    case "metric":
      return {
        blocked: t`${who} can't open this metric.`,
        allowed: t`${who} can see this metric.`,
      };
  }
}

function getNoResultsVerdictText(
  who: string,
  itemType: Exclude<ItemType, "dashboard">,
) {
  switch (itemType) {
    case "question":
      return t`${who} can open this question but can't see its results.`;
    case "model":
      return t`${who} can open this model but can't see its results.`;
    case "metric":
      return t`${who} can open this metric but can't see its results.`;
  }
}

function isBlocking({ column, cell }: WhyTarget) {
  return (
    (column === "view_data" && cell.value === "blocked") ||
    (column === "collection" && cell.value === "none")
  );
}

function isFiltered(target: WhyTarget) {
  return target.column === "view_data" && target.security != null;
}

/** The collection the item lives in, on whichever tab holds it; the root collection is the main tab's. */
function getCollectionTarget(
  who: string,
  collections: CollectionLists,
  collectionId: CollectionId | null,
): WhyTarget | null {
  const collection =
    collectionId == null
      ? collections.main.collections.find(({ id }) => id === "root")
      : collections.all.find(({ id }) => id === collectionId);
  return collection != null ? getCollectionWhyTarget(who, collection) : null;
}

function getCollectionWhyTarget(
  who: string,
  collection: PreviewCollection,
): WhyTarget {
  const name =
    collection.source === "personal"
      ? t`${who}'s personal collection`
      : collection.name;
  return {
    title: name,
    who,
    subject: { label: t`Collection`, value: name },
    column: "collection",
    cell: collection.access,
    security: null,
  };
}

function getTableWhyTarget(
  who: string,
  database: PreviewDatabase,
  table: PreviewTableAccess,
  column: Extract<PreviewColumn, "view_data" | "create_queries">,
): WhyTarget {
  const tableName = table.display_name ?? table.name;
  return {
    title: tableName,
    who,
    subject: { label: t`Table`, value: `${database.name} / ${tableName}` },
    column,
    cell: table[column],
    security: column === "view_data" ? table.security : null,
  };
}
