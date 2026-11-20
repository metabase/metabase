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
import { type WhyList, type WhyPreview, useWhyList } from "./use-why-list";

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
  groups: [
    { id: 5, name: "Sales" },
    { id: 8, name: "Finance readers" },
  ],
};

const SANDY_PREVIEW: WhyPreview = {
  principalType: "user",
  userId: SANDY.id,
  previewId: "preview-1",
};

const SALES_COLLECTION_ID = 5;

const PERSONAL_COLLECTION_ID = 10;

/** What the backend returns for a user's own personal collection: Curate from ownership, never from a group. */
const PERSONAL_COLLECTION: PreviewCollection = {
  id: PERSONAL_COLLECTION_ID,
  name: "Their personal collection",
  depth: 0,
  source: "personal",
  access: {
    value: "write",
    group_id: null,
    groups: [],
    note: "Everyone has Curate access to their own personal collection, whatever their groups.",
  },
};

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

const SALES_PRODUCTS_POLICY: PreviewSecurity = {
  ...ORDERS_SANDBOX,
  table_name: "Products",
  filters: [
    {
      attribute: "category",
      value: "Widget",
      each_member: false,
      column: "Products.Category",
    },
  ],
};

const FINANCE_PRODUCTS_POLICY: PreviewSecurity = {
  ...SALES_PRODUCTS_POLICY,
  group_id: 8,
  group_name: "Finance readers",
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
        expect(getVerdict(result.current)).toEqual({
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

    it("names the database of every table it lists, and of no collection", async () => {
      const { result } = setup({ path: "/model/1-orders-by-state" });

      await waitFor(() =>
        expect(getVerdict(result.current)).toMatchObject({ kind: "allowed" }),
      );
      const page = result.current?.page;
      expect(page).toMatchObject({
        tables: [{ title: "Orders", databaseName: "Sample Database" }],
        explore: [{ title: "Orders", databaseName: "Sample Database" }],
      });
      expect(page?.kind === "item" && page.collection).not.toHaveProperty(
        "databaseName",
      );
    });

    it("says the person can see a dashboard whose rows are filtered, and lists the table under row security", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
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

    it("says the person can't open a question the read check denies, and that its collection is why, even with a blocked table", async () => {
      const { result } = setup({
        path: "/question/1-orders-by-state",
        collectionAccess: "none",
        orders: { view_data: "blocked" },
        read: DENIED,
        query: DENIED,
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "blocked",
          text: "Sandy Sales can't open this question.",
          reason: "Sandy Sales has no access to its collection, Sales.",
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
        expect(getVerdict(result.current)).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this question but can't see its results.",
        }),
      );
    });

    it("says a dashboard's cards can't load when two groups set row security on a table they reach, and lists that table first", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
        productsPolicies: [SALES_PRODUCTS_POLICY, FINANCE_PRODUCTS_POLICY],
        query: {
          decision: "denied",
          data: {
            "card-count": 1,
            "blocked-card-count": 1,
            "conflicting-tables": [3],
          },
        },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see any of its cards.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        tables: [{ title: "Products" }, { title: "Orders" }],
      });
    });

    it("says a dashboard's cards can't load when a rule reads an attribute the person lacks, on Orders and on Products, which Orders filters through", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
        productsPolicies: [SALES_PRODUCTS_POLICY],
        query: {
          decision: "denied",
          data: {
            "card-count": 1,
            "blocked-card-count": 1,
            "missing-attributes": [
              { attribute: "state", "table-id": 1, "group-id": 5 },
              { attribute: "category", "table-id": 3, "group-id": 5 },
            ],
          },
        },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see any of its cards.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        tables: [
          {
            title: "Orders",
            missingAttributes: [
              { attribute: "state", "table-id": 1, "group-id": 5 },
            ],
          },
          {
            title: "Products",
            missingAttributes: [
              { attribute: "category", "table-id": 3, "group-id": 5 },
            ],
          },
        ],
      });
    });

    it("says a dashboard's cards can't load when row and column security and impersonation apply on its database, naming both groups on its tables", async () => {
      const conflict = {
        "database-id": 1,
        "sandbox-group-ids": [5],
        "impersonation-group-ids": [8],
      };
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
        query: {
          decision: "denied",
          data: {
            "card-count": 1,
            "blocked-card-count": 1,
            "conflicting-databases": [conflict],
          },
        },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see any of its cards.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        tables: [
          {
            title: "Orders",
            databaseConflict: {
              sandboxGroups: ["Sales"],
              impersonationGroups: ["Finance readers"],
            },
          },
        ],
      });
    });

    it("says a dashboard's cards can't load when impersonation or routing reads an attribute the person lacks, naming the group or the router", async () => {
      const missingRole = {
        attribute: "role",
        "database-id": 1,
        kind: "impersonation" as const,
        "group-id": 8,
      };
      const missingRoute = {
        attribute: "tenant",
        "database-id": 1,
        kind: "routing" as const,
      };
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        query: {
          decision: "denied",
          data: {
            "card-count": 1,
            "blocked-card-count": 1,
            "missing-database-attributes": [missingRole, missingRoute],
          },
        },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "partial",
          text: "Sandy Sales can open this dashboard but can't see any of its cards.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        tables: [
          {
            title: "Orders",
            missingDatabaseAttributes: [
              {
                attribute: "role",
                kind: "impersonation",
                group: "Finance readers",
              },
              { attribute: "tenant", kind: "routing" },
            ],
          },
        ],
      });
    });

    it("keeps a table out of the failure of a database the check names that holds none of the item's tables", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        query: {
          decision: "denied",
          data: {
            "card-count": 1,
            "blocked-card-count": 1,
            "conflicting-databases": [
              {
                "database-id": 2,
                "sandbox-group-ids": [5],
                "impersonation-group-ids": [8],
              },
            ],
          },
        },
      });

      await waitFor(() => expect(getVerdict(result.current)).toBeDefined());
      const page = result.current?.page;
      expect(page?.kind === "item" ? page.tables : []).toEqual([
        expect.objectContaining({
          title: "Orders",
          databaseConflict: undefined,
        }),
      ]);
    });

    it("asks whether the data loads with the preview's picked values, and whether the item opens without", async () => {
      setup({ path: "/dashboard/1-orders-by-state" });

      await waitFor(() =>
        expect(
          fetchMock.callHistory.called("path:/api/ee/permission_debug", {
            query: { action_type: "dashboard/query" },
          }),
        ).toBe(true),
      );
      const queryUrl = new URL(
        fetchMock.callHistory.lastCall("path:/api/ee/permission_debug", {
          query: { action_type: "dashboard/query" },
        })?.url ?? "",
      );
      expect(queryUrl.searchParams.get("preview_id")).toBe("preview-1");
      const readUrl = new URL(
        fetchMock.callHistory.lastCall("path:/api/ee/permission_debug", {
          query: { action_type: "dashboard/read" },
        })?.url ?? "",
      );
      expect(readUrl.searchParams.has("preview_id")).toBe(false);
    });

    it("keeps a table with one group's row security that the dashboard doesn't reach out of its tables", async () => {
      const { result } = setup({
        path: "/dashboard/1-orders-by-state",
        orders: { view_data: "sandboxed", security: ORDERS_SANDBOX },
        productsPolicies: [SALES_PRODUCTS_POLICY],
        query: {
          decision: "allow",
          data: { "card-count": 1, "blocked-card-count": 0 },
        },
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
          kind: "filtered",
          text: "Sandy Sales can see this dashboard.",
        }),
      );
      expect(result.current?.page).toMatchObject({
        tables: [{ title: "Orders" }],
      });
    });

    it("says the person can see a question in a shared collection, which the main tab doesn't hold", async () => {
      const { result } = setup({
        path: "/question/1-products-by-category",
        collectionNamespace: "shared",
        collectionName: "Product templates",
      });

      await waitFor(() =>
        expect(getVerdict(result.current)).toEqual({
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
        expect(getVerdict(result.current)).toEqual({
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
        expect(getVerdict(result.current)).toEqual({
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
          target: { title: "Sales" },
          collections: [],
        }),
      );
    });

    it("names a tenant user's personal collection and says they curate it, though the main tab doesn't apply to them", async () => {
      const { result } = setup({
        path: `/collection/${PERSONAL_COLLECTION_ID}`,
        isTenantUser: true,
        collections: { default: [PERSONAL_COLLECTION] },
      });

      await waitFor(() =>
        expect(result.current?.page).toMatchObject({
          kind: "collection",
          name: "Sandy Sales's personal collection",
          verdict: {
            kind: "allowed",
            text: "Sandy Sales can curate this collection.",
          },
          target: {
            title: "Sandy Sales's personal collection",
            cell: { value: "write" },
          },
        }),
      );
    });

    it("lists on Our analytics the collections right in it that the person can open, as the frame does", async () => {
      const { result } = setup({
        path: "/collection/root",
        collections: {
          default: [
            getCollection("root", "Our analytics", 0, "read"),
            getCollection(14, "Sales reports", 1, "write"),
            getCollection(15, "Q4 pipeline", 2, "write"),
            getCollection(16, "Finance", 1, "none"),
          ],
        },
      });

      await waitFor(() =>
        expect(result.current?.page).toMatchObject({
          kind: "collection",
          name: "Our analytics",
          target: { title: "Our analytics" },
          collections: [{ title: "Sales reports" }],
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
          target: { title: "Sales" },
        }),
      );
    });
  });

  describe("All collections", () => {
    it("lists Our analytics, the top shared collections and the person's own personal collection by name, only those the person can open", async () => {
      const { result } = setup({
        path: "/",
        isAllCollections: true,
        collections: {
          default: [
            getCollection("root", "Our analytics", 0, "read"),
            getCollection(14, "Sales reports", 1, "write"),
            {
              ...getCollection(11, "Their personal collection", 0, "write"),
              source: "personal",
            },
          ],
          shared: [
            getCollection("root", "Shared collections", 0, "read"),
            getCollection(18, "Onboarding kit", 1, "write"),
            getCollection(17, "Product templates", 1, "none"),
            getCollection(21, "Onboarding drafts", 2, "write"),
          ],
          tenant: [getCollection(9, "Tenant Collection: Acme", 0, "read")],
        },
      });

      await waitFor(() =>
        expect(getPageCollections(result.current)).toEqual([
          "Our analytics",
          "Onboarding kit",
          "Sandy Sales's personal collection",
        ]),
      );
    });

    it("lists a tenant user's personal collection after their tenant's collection", async () => {
      const { result } = setup({
        path: "/",
        isAllCollections: true,
        isTenantUser: true,
        collections: {
          default: [PERSONAL_COLLECTION],
          tenant: [
            {
              ...getCollection(9, "Tenant Collection: Acme", 0, "write"),
              source: "tenant",
            },
          ],
        },
      });

      await waitFor(() =>
        expect(getPageCollections(result.current)).toEqual([
          "Tenant Collection: Acme",
          "Sandy Sales's personal collection",
        ]),
      );
    });

    it("names the personal collection Their personal collection in a group preview, whose stand-in user has no name to put there", async () => {
      const { result } = setup({
        path: "/",
        isAllCollections: true,
        preview: { ...SANDY_PREVIEW, principalType: "group" },
        collections: {
          default: [
            getCollection("root", "Our analytics", 0, "read"),
            PERSONAL_COLLECTION,
          ],
        },
      });

      await waitFor(() =>
        expect(getPageCollections(result.current)).toEqual([
          "Our analytics",
          "Their personal collection",
        ]),
      );
    });

    it("lists the collections in Our analytics instead when the person can't open it", async () => {
      const { result } = setup({
        path: "/",
        isAllCollections: true,
        collections: {
          default: [
            getCollection("root", "Our analytics", 0, "none"),
            getCollection(14, "Sales reports", 1, "write"),
            getCollection(16, "Finance", 1, "none"),
          ],
        },
      });

      await waitFor(() =>
        expect(getPageCollections(result.current)).toEqual(["Sales reports"]),
      );
    });

    it("lists for a tenant user their own tenant's collection, and no internal or other tenant's collection", async () => {
      const { result } = setup({
        path: "/",
        isAllCollections: true,
        collections: {
          default: null,
          shared: [
            getCollection("root", "Shared collections", 0, "read"),
            getCollection(18, "Onboarding kit", 1, "read"),
          ],
          tenant: [
            {
              ...getCollection(9, "Tenant Collection: Acme", 0, "write"),
              source: "tenant",
            },
            {
              ...getCollection(10, "Acme reports", 1, "write"),
              source: "tenant",
            },
            {
              ...getCollection(12, "Tenant Collection: Globex", 0, "none"),
              source: "other-tenant",
            },
          ],
        },
      });

      await waitFor(() =>
        expect(getPageCollections(result.current)).toEqual([
          "Onboarding kit",
          "Tenant Collection: Acme",
        ]),
      );
      // nor does their whole access count another tenant's collection as one they can't access
      expect(
        result.current?.summary.blockedCollections.map(({ title }) => title),
      ).toEqual([]);
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
      blockedCollections: [],
      tables: [{ title: "Orders" }],
    });
  });

  it("doesn't count a table with two groups' row security as one the person can view", async () => {
    const { result } = setup({
      path: "/",
      productsPolicies: [SALES_PRODUCTS_POLICY, FINANCE_PRODUCTS_POLICY],
    });

    await waitFor(() => expect(result.current?.page).toBeNull());
    expect(result.current?.summary.verdict.text).toBe(
      "Sandy Sales can open 1 collection and view 1 table.",
    );
  });

  // guard: one group's row security on a table still counts as viewable
  it("counts a table with one group's row security as one the person can view", async () => {
    const { result } = setup({
      path: "/",
      productsPolicies: [SALES_PRODUCTS_POLICY],
    });

    await waitFor(() => expect(result.current?.page).toBeNull());
    expect(result.current?.summary.verdict.text).toBe(
      "Sandy Sales can open 1 collection and view 2 tables.",
    );
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
  /** The rules on a Products table the item doesn't query itself; given, the table is in the data. */
  productsPolicies?: PreviewSecurity[];
  read?: PermissionDebugResponse;
  query?: PermissionDebugResponse;
  /** Each tab's collections in place of the one Sales collection; `null` for a tab that doesn't apply. */
  collections?: Partial<
    Record<CollectionNamespace, PreviewCollection[] | null>
  >;
  isAllCollections?: boolean;
  /** A tenant user: the main tab doesn't apply to them, though it still holds their personal collection. */
  isTenantUser?: boolean;
};

function setup({
  path,
  preview = SANDY_PREVIEW,
  collectionAccess = "read",
  collectionNamespace = "default",
  collectionName = "Sales",
  orders = {},
  productsPolicies = [],
  read = ALLOW,
  query = ALLOW,
  collections,
  isAllCollections,
  isTenantUser = false,
}: SetupOpts) {
  const collection = getCollection(
    SALES_COLLECTION_ID,
    collectionName,
    1,
    collectionAccess,
  );
  const namespaces: CollectionNamespace[] = ["default", "shared", "tenant"];
  namespaces.forEach((namespace) =>
    setupPermissionPreviewCollectionsEndpoint(
      namespace,
      getCollections(
        collections != null
          ? (collections[namespace] ?? null)
          : namespace === collectionNamespace
            ? [collection]
            : null,
        isTenantUser && namespace === "default" ? false : undefined,
      ),
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
    policies: orders.security != null ? [orders.security] : [],
  };
  const productsTable: PreviewTableAccess = {
    ...ordersTable,
    id: 3,
    name: "PRODUCTS",
    display_name: "Products",
    view_data: getCell("sandboxed"),
    security: productsPolicies[0] ?? null,
    policies: productsPolicies,
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
        tables:
          productsPolicies.length > 0
            ? [ordersTable, productsTable]
            : [ordersTable],
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
    () => useWhyList(preview, item, "Sandy Sales", isAllCollections),
    {},
  );
}

function getCollection(
  id: PreviewCollection["id"],
  name: string,
  depth: number,
  access: string,
): PreviewCollection {
  return { id, name, depth, source: "group", access: getCell(access) };
}

function getVerdict(list: WhyList | null) {
  const page = list?.page;
  return page != null && page.kind !== "all-collections"
    ? page.verdict
    : undefined;
}

/** The names of the collections the page lists, on All collections or Our analytics. */
function getPageCollections(list: WhyList | null) {
  const page = list?.page;
  return page?.kind === "all-collections" || page?.kind === "collection"
    ? page.collections.map(({ title }) => title)
    : undefined;
}

/** One tab's collections; `null` for a tab that doesn't apply to the person, which can still hold some. */
function getCollections(
  collections: PreviewCollection[] | null,
  isApplied = collections != null,
): PreviewCollectionsResponse {
  return {
    principal: SANDY,
    applies: isApplied,
    reason: isApplied ? null : "Not in a tenant.",
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
