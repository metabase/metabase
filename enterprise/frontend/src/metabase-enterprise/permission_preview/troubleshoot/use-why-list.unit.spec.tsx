import fetchMock from "fetch-mock";

import {
  setupPermissionDebugEndpoint,
  setupPermissionPreviewCollectionsEndpoint,
  setupPermissionPreviewDataEndpoint,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";

import type {
  CollectionNamespace,
  ItemDependencies,
  PermissionDebugResponse,
  PreviewCell,
  PreviewCollection,
  PreviewCollectionsResponse,
  PreviewDataResponse,
  PreviewPrincipal,
  PreviewSecurity,
  PreviewTableAccess,
} from "../api";

import { parseOpenedItem } from "./item-path";
import { type WhyPreview, useWhyList } from "./use-why-list";

/** The user a preview runs as: Sandy herself, or the stand-in user of a group or tenant. */
const SANDY: PreviewPrincipal = {
  type: "user",
  id: 3,
  name: "Sandy Sales",
  detail: null,
  member_count: null,
  superuser: false,
  tenant_side: false,
  attributes: null,
  groups: [],
};

const SANDY_PREVIEW: WhyPreview = { userId: SANDY.id, previewId: "preview-1" };

const SALES_COLLECTION_ID = 5;

const ORDERS_SANDBOX: PreviewSecurity = {
  kind: "sandbox",
  group_id: 5,
  group_name: "Sales",
  database_name: "Sample Database",
  table_name: "Orders",
  rows: null,
  filters: [
    { attribute: "state", value: "TX", each_member: false, column: null },
  ],
  columns: "All columns.",
};

const DEPENDENCIES: ItemDependencies = {
  name: "Orders by state",
  collection_id: SALES_COLLECTION_ID,
  table_ids: [1],
  whole_database_ids: [],
  database_ids: [1],
};

const ALLOW: PermissionDebugResponse = { decision: "allow", data: {} };
const DENIED: PermissionDebugResponse = { decision: "denied", data: {} };

describe("useWhyList", () => {
  it.each([
    ["/model/1-orders-by-state", "model"],
    ["/metric/1-orders-by-state", "metric"],
    ["/question/1-orders-by-state", "question"],
    ["/dashboard/1-orders-by-state", "dashboard"],
  ])("reads the item open at %s as a %s", async (path, itemType) => {
    const { result } = setup({ path });

    await waitFor(() =>
      expect(result.current?.page).toMatchObject({
        kind: "item",
        itemType,
        name: "Orders by state",
      }),
    );
  });

  it("asks about the user the preview runs as, with the values and edits it runs with", async () => {
    setup({
      path: "/question/1-orders-by-state",
      preview: { ...SANDY_PREVIEW, unsavedEditsId: "edits-1" },
    });

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/permission_debug/preview/data",
        ),
      ).toBe(true),
    );
    const dataUrl = new URL(
      fetchMock.callHistory.lastCall(
        "path:/api/ee/permission_debug/preview/data",
      )?.url ?? "",
    );
    expect(Object.fromEntries(dataUrl.searchParams)).toEqual({
      "principal-type": "user",
      "principal-id": "3",
      "preview-id": "preview-1",
      "unsaved-edits-id": "edits-1",
    });
    const namespaces = fetchMock.callHistory
      .calls("path:/api/ee/permission_debug/preview/collections")
      .map((call) => new URL(call.url).searchParams.get("namespace"));
    expect(namespaces.sort()).toEqual(["default", "shared", "tenant"]);
  });

  describe("an item", () => {
    it("says the person can see a model that opens and whose data loads", async () => {
      const { result } = setup({ path: "/model/1-orders-by-state" });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "allowed",
          text: "Sandy Sales can see this model.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        filtered: [],
        collection: { title: "Sales" },
        tables: [{ title: "Orders", column: "view_data" }],
        explore: [{ title: "Orders", column: "create_queries" }],
      });
    });

    it("says the person can see a dashboard whose rows are filtered, and lists the table under row security", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "filtered",
          text: "Sandy Sales can see this dashboard.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        filtered: [{ title: "Orders", column: "view_data" }],
      });
    });

    it("keeps every permission, Create queries included, for the folded list", async () => {
      const { result } = setup({ path: "/dashboard/1-orders-by-state" });

      await waitFor(() =>
        expect(
          result.current?.page?.kind === "item" &&
            result.current.page.permissions.map(
              ({ title, column }) => `${title} ${column}`,
            ),
        ).toEqual([
          "Sales collection",
          "Orders view_data",
          "Orders create_queries",
        ]),
      );
    });

    it("says the person can't open a question the read check denies, even with a blocked table, without naming a reason", async () => {
      const { result } = setup({
        path: "/question/1-orders-by-state",
        collectionAccess: "none",
        orders: { view_data: "blocked" },
        read: DENIED,
        query: DENIED,
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "blocked",
          text: "Sandy Sales can't open this question.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        collection: { title: "Sales", cell: { value: "none" } },
      });
    });

    it("says a question opens but its results don't when only the query check denies it", async () => {
      const { result } = setup({
        path: "/question/1-orders-by-state",
        orders: { view_data: "blocked" },
        query: DENIED,
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this question but can't see its results.",
        }),
      );
    });

    it("says the person can see a question in a shared collection, which the main tab doesn't hold", async () => {
      const { result } = setup({
        path: "/question/1-products-by-category",
        collectionNamespace: "shared",
        collectionName: "Product templates",
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "allowed",
          text: "Sandy Sales can see this question.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        collection: {
          title: "Product templates",
          cell: { value: "read", groups: [{ name: "Sales" }] },
        },
      });
    });

    it("counts a dashboard's cards whose data doesn't load", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "blocked" },
        query: {
          decision: "limited",
          data: { "card-count": 5, "blocked-card-count": 2 },
        },
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see 2 of its 5 cards.",
        }),
      );
    });

    it("says none of a dashboard's cards load when every card is blocked", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "blocked" },
        query: {
          decision: "denied",
          data: { "card-count": 3, "blocked-card-count": 3 },
        },
      });

      await waitFor(() =>
        expect(result.current?.page?.verdict).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see any of its cards.",
        }),
      );
    });
  });

  describe("a collection", () => {
    it("says how the person can open it, and from which group", async () => {
      const { result } = setup({ path: `/collection/${SALES_COLLECTION_ID}` });

      await waitFor(() =>
        expect(result.current?.page).toMatchObject({
          kind: "collection",
          name: "Sales",
          verdict: {
            kind: "allowed",
            text: "Sandy Sales can view this collection.",
            group: "Sales",
          },
          reasons: [{ title: "Sales" }],
        }),
      );
    });

    it("says the person can't open it when the read check denies it", async () => {
      const { result } = setup({
        path: `/collection/${SALES_COLLECTION_ID}`,
        collectionAccess: "none",
        read: DENIED,
      });

      await waitFor(() =>
        expect(result.current?.page).toMatchObject({
          verdict: {
            kind: "blocked",
            text: "Sandy Sales can't open this collection.",
          },
          blocked: [{ title: "Sales" }],
        }),
      );
    });
  });

  it("sums up the person's whole access when no item is open", async () => {
    const { result } = setup({
      path: "/",
      orders: { view_data: "blocked" },
    });

    await waitFor(() => expect(result.current?.page).toBeNull());
    expect(result.current?.summary).toMatchObject({
      verdict: {
        kind: "partial",
        text: "Sandy Sales can open 1 collection and view 0 tables.",
      },
      blocked: [{ title: "Orders" }],
    });
  });
});

type SetupOpts = {
  path: string;
  preview?: WhyPreview;
  collectionAccess?: string;
  /** The tab that holds the item's collection, the main one unless given; the others don't apply to the person. */
  collectionNamespace?: CollectionNamespace;
  collectionName?: string;
  orders?: { view_data?: string; security?: PreviewSecurity };
  read?: PermissionDebugResponse;
  query?: PermissionDebugResponse;
};

function setup({
  path,
  preview = SANDY_PREVIEW,
  collectionAccess = "read",
  collectionNamespace = "default",
  collectionName = "Sales",
  orders = {},
  read = ALLOW,
  query = ALLOW,
}: SetupOpts) {
  const collection: PreviewCollection = {
    id: SALES_COLLECTION_ID,
    name: collectionName,
    depth: 1,
    source: "group",
    access: getCell(collectionAccess),
  };
  const namespaces: CollectionNamespace[] = ["default", "shared", "tenant"];
  namespaces.forEach((namespace) =>
    setupPermissionPreviewCollectionsEndpoint(
      namespace,
      getCollections(namespace === collectionNamespace ? [collection] : null),
    ),
  );
  const ordersTable: PreviewTableAccess = {
    id: 1,
    schema: "PUBLIC",
    name: "ORDERS",
    display_name: "Orders",
    view_data: getCell(orders.view_data ?? "unrestricted"),
    create_queries: getCell("query-builder"),
    download_results: getCell("one-million-rows"),
    manage_table_metadata: getCell("no"),
    security: orders.security ?? null,
  };
  const data: PreviewDataResponse = {
    principal: SANDY,
    databases: [
      {
        id: 1,
        name: "Sample Database",
        reasons: [],
        manage_database: getCell("no"),
        transforms: getCell("no"),
        tables: [ordersTable],
      },
    ],
  };
  fetchMock.get(
    "path:/api/ee/permission_debug/preview/item-scope",
    DEPENDENCIES,
  );
  setupPermissionPreviewDataEndpoint(data);
  const item = parseOpenedItem(path);
  if (item != null && item.id != null) {
    const model = item.type;
    setupPermissionDebugEndpoint(
      {
        userId: preview.userId,
        modelId: item.id,
        actionType: `${model}/read`,
      },
      read,
    );
    if (model !== "collection") {
      setupPermissionDebugEndpoint(
        {
          userId: preview.userId,
          modelId: item.id,
          actionType: `${model}/query`,
        },
        query,
      );
    }
  }

  return renderHookWithProviders(
    () => useWhyList(preview, item, "Sandy Sales"),
    {},
  );
}

/** One tab's collections; `null` for a tab that doesn't apply to the person. */
function getCollections(
  collections: PreviewCollection[] | null,
): PreviewCollectionsResponse {
  return {
    principal: SANDY,
    applies: collections != null,
    reason: collections != null ? null : "Not in a tenant.",
    collections: collections ?? [],
  };
}

function getCell(value: string): PreviewCell {
  return {
    value,
    group_id: 5,
    groups: [{ group_id: 5, name: "Sales", value }],
    note: null,
  };
}
