import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPermissionDebugEndpoint,
  setupPermissionPreviewCollectionsEndpoint,
  setupPermissionPreviewDataEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";

import type {
  ConflictingDatabase,
  ItemDependencies,
  MissingDatabaseAttribute,
  PermissionDebugResponse,
  PreviewCell,
  PreviewCollection,
  PreviewCollectionsResponse,
  PreviewDataResponse,
  PreviewPrincipal,
  PreviewSecurity,
  PreviewTableAccess,
} from "../api";

import { WhyListSidesheet } from "./WhyListSidesheet";
import type { OpenedItem } from "./item-path";
import type { WhyPreview } from "./use-why-list";

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

const SALES_OVERVIEW_ID = 12;
const SALES_REPORTS_ID = 14;
const Q4_PIPELINE_ID = 15;
const ORDERS_ID = 2;
const REVIEWS_ID = 3;
const ACCOUNTS_ID = 4;
const INVOICES_ID = 5;
const PRODUCTS_ID = 6;
const PERSONAL_COLLECTION_ID = 10;

const COLLECTIONS: PreviewCollectionsResponse = {
  principal: SANDY,
  applies: true,
  reason: null,
  collections: [
    {
      id: SALES_REPORTS_ID,
      name: "Sales reports",
      depth: 1,
      source: "group",
      access: getCell("write"),
    },
    {
      id: Q4_PIPELINE_ID,
      name: "Q4 pipeline",
      depth: 2,
      source: "group",
      access: getCell("read"),
    },
  ],
};

const NO_COLLECTIONS: PreviewCollectionsResponse = {
  principal: SANDY,
  applies: false,
  reason: "Not in a tenant.",
  collections: [],
};

const ALLOW: PermissionDebugResponse = { decision: "allow", data: {} };
const DENIED: PermissionDebugResponse = { decision: "denied", data: {} };

const ORDERS_SECURITY: PreviewSecurity = {
  kind: "sandbox",
  group_id: 5,
  group_name: "Sales",
  database_name: "Sample Database",
  table_name: "Orders",
  rows: null,
  filters: [
    {
      attribute: "state",
      value: "TX",
      each_member: false,
      column: "People.State",
    },
  ],
  columns: "All columns.",
};

const ORDERS: PreviewTableAccess = {
  id: ORDERS_ID,
  schema: "PUBLIC",
  name: "ORDERS",
  display_name: "Orders",
  view_data: getCell("sandboxed"),
  create_queries: {
    ...getCell("query-builder"),
    groups: [
      { group_id: 5, name: "Sales", value: "query-builder" },
      { group_id: 1, name: "All internal users", value: "no" },
    ],
  },
  download_results: getCell("one-million-rows"),
  manage_table_metadata: getCell("no"),
  security: ORDERS_SECURITY,
  policies: [ORDERS_SECURITY],
};

const SALES_PRODUCTS_POLICY: PreviewSecurity = {
  ...ORDERS_SECURITY,
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

/** Two groups of the person set row security here, and Orders filters through it. */
const PRODUCTS: PreviewTableAccess = {
  ...ORDERS,
  id: PRODUCTS_ID,
  name: "PRODUCTS",
  display_name: "Products",
  security: SALES_PRODUCTS_POLICY,
  policies: [SALES_PRODUCTS_POLICY, FINANCE_PRODUCTS_POLICY],
};

/** Sandy has no value for the attributes the rules on Orders and Products read. */
const ORDERS_RULE_WITHOUT_VALUES: PreviewSecurity = {
  ...ORDERS_SECURITY,
  filters: [
    {
      attribute: "category",
      value: null,
      each_member: false,
      column: "Products.Category",
    },
    {
      attribute: "state",
      value: null,
      each_member: false,
      column: "People.State",
    },
  ],
};

const ORDERS_WITHOUT_VALUES: PreviewTableAccess = {
  ...ORDERS,
  security: ORDERS_RULE_WITHOUT_VALUES,
  policies: [ORDERS_RULE_WITHOUT_VALUES],
};

const PRODUCTS_RULE_WITHOUT_VALUE: PreviewSecurity = {
  ...SALES_PRODUCTS_POLICY,
  filters: [{ ...SALES_PRODUCTS_POLICY.filters[0], value: null }],
};

const PRODUCTS_WITHOUT_VALUES: PreviewTableAccess = {
  ...PRODUCTS,
  security: PRODUCTS_RULE_WITHOUT_VALUE,
  policies: [PRODUCTS_RULE_WITHOUT_VALUE],
};

/** Sales' row and column security and Finance readers' connection impersonation both apply on the sample database. */
const CONFLICTING_DATABASE: ConflictingDatabase = {
  "database-id": 1,
  "sandbox-group-ids": [5],
  "impersonation-group-ids": [8],
};

/** Finance readers' impersonation policy reads `role`, and the sample database routes by `tenant`; Sandy has neither. */
const MISSING_ROLE: MissingDatabaseAttribute = {
  attribute: "role",
  "database-id": 1,
  kind: "impersonation",
  "group-id": 8,
};

const MISSING_ROUTE: MissingDatabaseAttribute = {
  attribute: "tenant",
  "database-id": 1,
  kind: "routing",
};

/** What the query check says when the Sales rules on Orders and Products read attributes Sandy lacks. */
const MISSING_ATTRIBUTES_QUERY: PermissionDebugResponse = {
  decision: "denied",
  data: {
    "card-count": 1,
    "blocked-card-count": 1,
    "missing-attributes": [
      { attribute: "category", "table-id": ORDERS_ID, "group-id": 5 },
      { attribute: "state", "table-id": ORDERS_ID, "group-id": 5 },
      { attribute: "category", "table-id": PRODUCTS_ID, "group-id": 5 },
    ],
    "blocked-cards": [
      {
        id: 134,
        name: "Revenue by month",
        tables: [],
        "missing-attributes": [
          { attribute: "category", "table-id": ORDERS_ID, "group-id": 5 },
          { attribute: "state", "table-id": ORDERS_ID, "group-id": 5 },
          { attribute: "category", "table-id": PRODUCTS_ID, "group-id": 5 },
        ],
      },
    ],
  },
};

/** What the query check says when the one attribute impersonation or routing reads on the sample database is missing. */
function getMissingDatabaseAttributeQuery(
  missing: MissingDatabaseAttribute,
): PermissionDebugResponse {
  return {
    decision: "denied",
    data: {
      "card-count": 1,
      "blocked-card-count": 1,
      "missing-database-attributes": [missing],
      "blocked-cards": [
        {
          id: 134,
          name: "Revenue by month",
          tables: [],
          "missing-database-attributes": [missing],
        },
      ],
    },
  };
}

const SALES_GROUP_PREVIEW: WhyPreview = {
  principalType: "group",
  principalName: "Sales",
  userId: SANDY.id,
};

const REVIEWS: PreviewTableAccess = {
  ...ORDERS,
  id: REVIEWS_ID,
  name: "REVIEWS",
  display_name: "Reviews",
  view_data: getCell("blocked"),
  create_queries: getCell("no"),
  security: null,
  policies: [],
};

const FEEDBACK: PreviewTableAccess = {
  ...REVIEWS,
  id: 7,
  name: "FEEDBACK",
  display_name: "Feedback",
};

const PEOPLE: PreviewTableAccess = {
  ...REVIEWS,
  id: 8,
  name: "PEOPLE",
  display_name: "People",
};

/** Two groups of the person set row security here too, like Products. */
const EVENTS: PreviewTableAccess = {
  ...PRODUCTS,
  id: 9,
  name: "EVENTS",
  display_name: "Events",
};

const ACCOUNTS: PreviewTableAccess = {
  ...ORDERS,
  id: ACCOUNTS_ID,
  name: "ACCOUNTS",
  display_name: "Accounts",
  view_data: getCell("unrestricted"),
  security: null,
  policies: [],
};

const INVOICES: PreviewTableAccess = {
  ...ACCOUNTS,
  id: INVOICES_ID,
  name: "INVOICES",
  display_name: "Invoices",
};

const DATA: PreviewDataResponse = {
  principal: SANDY,
  databases: [
    {
      id: 1,
      name: "Sample Database",
      reasons: [],
      manage_database: getCell("no"),
      transforms: getCell("no"),
      tables: [ORDERS, REVIEWS, ACCOUNTS, INVOICES],
    },
  ],
};

const SALES_OVERVIEW: ItemDependencies = {
  name: "Sales overview",
  collection_id: SALES_REPORTS_ID,
  table_ids: [ORDERS_ID],
  whole_database_ids: [],
  database_ids: [1],
};

describe("WhyListSidesheet", () => {
  it("answers first, then opening the dashboard, its data and exploring it", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
    expect(screen.getByText("Explain access")).toBeInTheDocument();
    expect(screen.getByText("as Sandy Sales")).toBeInTheDocument();
    expect(screen.getByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can see this dashboard.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    expect(screen.getByText("Opening this dashboard")).toBeInTheDocument();
    expect(getVisibleTexts("Collection")).toHaveLength(1);
    expect(getVisibleTexts("Sales reports")).toHaveLength(1);
    expect(
      getRowStatus("Collection Sales reports from Sales"),
    ).toHaveTextContent("Curate");

    expect(screen.getByText("Data in this dashboard")).toBeInTheDocument();
    expect(screen.getByTitle("state TX → People.State")).toHaveTextContent(
      "stateTX→ People.State",
    );
    expect(screen.getByText("Rules set by Sales")).toBeInTheDocument();

    expect(screen.getByText("Exploring this dashboard")).toBeInTheDocument();
    expect(getRowStatus("Orders from Sales")).toHaveTextContent(
      "Query builder only",
    );
  });

  it("makes only a row's status a button, with its group on a line of its own under the name", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    const status = await findRowStatus("Collection Sales reports from Sales");

    expect(status).toHaveTextContent("Curate");
    expect(status).not.toHaveTextContent("from Sales");
    expect(status).not.toHaveTextContent("Sales reports");
  });

  it("shows a long item name in full, not cut, with who it's for on its own line below", async () => {
    const longName =
      "Revenue by product category and month, all regions, compared with last year";
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      dashboardName: longName,
    });

    const name = await screen.findByText(longName);
    expect(name).not.toHaveAttribute("data-truncate");
    const who = screen.getByText("as Sandy Sales");
    expect(who).not.toHaveAttribute("data-truncate");
    expect(name).not.toContainElement(who);
  });

  it("keeps See everything's heading on one line that truncates, at the default size", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await userEvent.click(
      await screen.findByText("See everything Sandy Sales can access"),
    );

    const heading = await screen.findByText(
      "Everything Sandy Sales can access",
    );

    expect(heading).toHaveAttribute("data-truncate", "end");
    expect(heading).toHaveAttribute("data-size", "md");
  });

  it("says on hover or focus that the dashboard's collection decides", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    const info = await screen.findByRole("button", {
      name: "About collection permissions",
    });

    await userEvent.hover(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Dashboards don't have their own permissions. Anyone who can see the dashboard's collection can open the dashboard.",
    );
    await userEvent.unhover(info);
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );

    act(() => info.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Dashboards don't have their own permissions.",
    );
  });

  it("puts a blocked verdict in an error alert that says why not, with the collection under Opening this dashboard", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      salesReportsAccess: "none",
      dashboardRead: DENIED,
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Sandy Sales can't open this dashboard.Sandy Sales has no access to its collection, Sales reports.",
    );
    expect(
      within(alert).getByRole("img", { name: "close icon" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Opening this dashboard")).toBeInTheDocument();
    expect(getVisibleTexts("No access")).toHaveLength(1);
  });

  it("shows a dashboard that opens with some cards blocked as a warning, not an error alert", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      dashboardQuery: {
        decision: "limited",
        data: { "card-count": 5, "blocked-card-count": 2 },
      },
    });

    const verdict = await screen.findByTestId("why-verdict");
    expect(verdict).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see 2 of its 5 cards.",
    );
    expect(
      within(verdict).getByRole("img", { name: "warning icon" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a partly blocked dashboard's blocked table in Data in this dashboard, with no Cards that can't load section, and its status opens the table", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
      dashboardQuery: {
        decision: "limited",
        data: {
          "card-count": 2,
          "blocked-card-count": 1,
          "blocked-cards": [
            { id: 7, name: "Reviews by rating", tables: ["REVIEWS"] },
          ],
        },
      },
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see 1 of its 2 cards.",
    );
    expect(screen.queryByText("Cards that can't load")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviews by rating")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviews table blocked")).not.toBeInTheDocument();
    const status = await findRowStatus("Reviews · Sample Database");
    expect(status).toHaveTextContent("Blocked");

    await userEvent.click(status);

    expect(
      screen.getByText(
        "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
  });

  it("says Orders-only cards can't load when two groups set row security on Products, which Orders filters through", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, PRODUCTS],
      dashboardQuery: {
        decision: "denied",
        data: {
          "card-count": 1,
          "blocked-card-count": 1,
          "conflicting-tables": [PRODUCTS_ID],
          "blocked-cards": [
            {
              id: 134,
              name: "Revenue by month",
              tables: [],
              "conflicting-tables": [PRODUCTS_ID],
            },
          ],
        },
      },
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see any of its cards.",
    );
    expect(screen.queryByText("Cards that can't load")).not.toBeInTheDocument();
    expect(screen.queryByText("Revenue by month")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Conflicting policies on Products"),
    ).not.toBeInTheDocument();
    // the table's status only
    expect(screen.getAllByRole("button", { name: /Can't load/ })).toHaveLength(
      1,
    );
    expect(
      screen.getByText(
        "Sales and Finance readers both set row and column security on Products. Keep one policy, or give one of the groups Can view on Products.",
      ),
    ).toBeInTheDocument();
    expect(getVisibleTexts("Rules set by Finance readers")).toHaveLength(1);
    // Orders has one rule and still reads Rows filtered; its rule is the other "Sales" line
    expect(getVisibleTexts("Rules set by Sales")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Rows filtered/ })).toBeVisible();
  });

  it("opens the table's detail from its Can't load status, with each group's rule", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, PRODUCTS],
      dashboardQuery: {
        decision: "denied",
        data: {
          "card-count": 1,
          "blocked-card-count": 1,
          "conflicting-tables": [PRODUCTS_ID],
          "blocked-cards": [
            {
              id: 134,
              name: "Revenue by month",
              tables: [],
              "conflicting-tables": [PRODUCTS_ID],
            },
          ],
        },
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Can't load/ }),
    );

    expect(
      screen.getByText(
        "Sales and Finance readers both set row and column security on Products.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Set by")).toHaveLength(2);
  });

  it("says the cards can't load when a rule reads attributes the person lacks, naming each table's missing attributes and the group that needs them", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS_WITHOUT_VALUES, PRODUCTS_WITHOUT_VALUES],
      dashboardQuery: MISSING_ATTRIBUTES_QUERY,
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see any of its cards.",
    );
    expect(screen.queryByText("Revenue by month")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Missing category and state"),
    ).not.toBeInTheDocument();
    // one status per table: Products is in the data though the dashboard doesn't query it
    expect(screen.getAllByRole("button", { name: /Can't load/ })).toHaveLength(
      2,
    );
    expect(
      screen.getByText(
        "Sales needs the attributes category and state, which Sandy Sales doesn't have. Set them on Sandy Sales in Admin › People, or in their sign-in provider.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sales needs the attribute category, which Sandy Sales doesn't have. Set it on Sandy Sales in Admin › People, or in their sign-in provider.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rows filtered/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the table's detail from its Can't load status, with the missing attributes and the rule that reads them", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS_WITHOUT_VALUES, PRODUCTS_WITHOUT_VALUES],
      dashboardQuery: MISSING_ATTRIBUTES_QUERY,
    });

    const [, tableStatus] = await screen.findAllByRole("button", {
      name: /Can't load/,
    });
    await userEvent.click(tableStatus);

    expect(
      screen.getByText(
        "Sales needs the attribute category, which Sandy Sales doesn't have.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Set it on Sandy Sales in Admin › People, or in their sign-in provider.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Set by")).toHaveLength(1);
  });

  it("says both when a table has two groups' row security and each needs an attribute the person lacks", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS_WITHOUT_VALUES, PRODUCTS],
      dashboardQuery: {
        decision: "denied",
        data: {
          "card-count": 1,
          "blocked-card-count": 1,
          "conflicting-tables": [PRODUCTS_ID],
          "missing-attributes": [
            { attribute: "category", "table-id": PRODUCTS_ID, "group-id": 5 },
            { attribute: "category", "table-id": PRODUCTS_ID, "group-id": 8 },
          ],
          "blocked-cards": [
            {
              id: 134,
              name: "Revenue by month",
              tables: [],
              "conflicting-tables": [PRODUCTS_ID],
              "missing-attributes": [
                {
                  attribute: "category",
                  "table-id": PRODUCTS_ID,
                  "group-id": 5,
                },
              ],
            },
          ],
        },
      },
    });

    expect(
      await screen.findByText(
        "Sales and Finance readers both set row and column security on Products. Keep one policy, or give one of the groups Can view on Products.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sales needs the attribute category, which Sandy Sales doesn't have. Finance readers needs the attribute category, which Sandy Sales doesn't have. Set it on Sandy Sales in Admin › People, or in their sign-in provider.",
      ),
    ).toBeInTheDocument();
  });

  it("says the cards can't load when row and column security and connection impersonation apply on one database, naming both groups", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      dashboardQuery: {
        decision: "denied",
        data: {
          "card-count": 1,
          "blocked-card-count": 1,
          "conflicting-databases": [CONFLICTING_DATABASE],
          "blocked-cards": [
            {
              id: 134,
              name: "Revenue by month",
              tables: [],
              "conflicting-databases": [CONFLICTING_DATABASE],
            },
          ],
        },
      },
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see any of its cards.",
    );
    expect(
      screen.queryByText("Conflicting policies on Sample Database"),
    ).not.toBeInTheDocument();
    // the database's table only
    expect(screen.getAllByRole("button", { name: /Can't load/ })).toHaveLength(
      1,
    );
    expect(
      screen.getByText(
        "Row and column security from Sales and connection impersonation from Finance readers both apply on Sample Database. Keep one of the two policies.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rows filtered/ }),
    ).not.toBeInTheDocument();
  });

  it("says the cards can't load when connection impersonation or routing reads an attribute the person lacks, naming the group or the router", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      // two tables with full access, which would otherwise fold into one row
      tables: [{ ...ORDERS, security: null, policies: [] }, REVIEWS],
      tableIds: [ORDERS_ID, REVIEWS_ID],
      dashboardQuery: {
        decision: "denied",
        data: {
          "card-count": 1,
          "blocked-card-count": 1,
          "missing-database-attributes": [MISSING_ROLE, MISSING_ROUTE],
          "blocked-cards": [
            {
              id: 134,
              name: "Revenue by month",
              tables: [],
              "missing-database-attributes": [MISSING_ROLE, MISSING_ROUTE],
            },
          ],
        },
      },
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see any of its cards.",
    );
    expect(
      screen.queryByText("Missing role and tenant"),
    ).not.toBeInTheDocument();
    // each table's status
    expect(screen.getAllByRole("button", { name: /Can't load/ })).toHaveLength(
      2,
    );
    expect(
      screen.getAllByText(
        "Finance readers needs the attribute role to pick the database role on Sample Database, which Sandy Sales doesn't have. Sample Database routes by the attribute tenant, which Sandy Sales doesn't have. Set them on Sandy Sales in Admin › People, or in their sign-in provider.",
      ),
    ).toHaveLength(2);
  });

  it("says a group's members need the attributes a rule reads, and to pick values in the preview, not to set them", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS_WITHOUT_VALUES, PRODUCTS_WITHOUT_VALUES],
      dashboardQuery: MISSING_ATTRIBUTES_QUERY,
      preview: SALES_GROUP_PREVIEW,
      sentenceWhoName: "A member of Sales",
    });

    expect(
      await screen.findByText(
        "Members of Sales need the attributes category and state (rule set by Sales). Pick values for them in the preview to see their view.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Members of Sales need the attribute category (rule set by Sales). Pick a value for it in the preview to see their view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Set it on|Set them on/)).not.toBeInTheDocument();
  });

  it("says a group's members need the attribute impersonation reads, not that it can be set on a stand-in", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [{ ...ORDERS, security: null, policies: [] }],
      dashboardQuery: getMissingDatabaseAttributeQuery(MISSING_ROLE),
      preview: SALES_GROUP_PREVIEW,
      sentenceWhoName: "A member of Sales",
    });

    expect(
      await screen.findByText(
        "Members of Sales need the attribute role to pick the database role on Sample Database (rule set by Finance readers). Pick a value for it in the preview to see their view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Set it on|Set them on/)).not.toBeInTheDocument();
  });

  it("says a group's members need the attribute a database's router reads, not that it can be set on a stand-in", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [{ ...ORDERS, security: null, policies: [] }],
      dashboardQuery: getMissingDatabaseAttributeQuery(MISSING_ROUTE),
      preview: SALES_GROUP_PREVIEW,
      sentenceWhoName: "A member of Sales",
    });

    expect(
      await screen.findByText(
        "Members of Sales need the attribute tenant (Sample Database routes by it). Pick a value for it in the preview to see their view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Set it on|Set them on/)).not.toBeInTheDocument();
  });

  it("keeps Rows filtered for a table with one group's rule that the dashboard reaches", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, { ...PRODUCTS, policies: [SALES_PRODUCTS_POLICY] }],
      tableIds: [ORDERS_ID, PRODUCTS_ID],
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can see this dashboard.",
    );
    expect(
      screen.getAllByRole("button", { name: /Rows filtered/ }),
    ).toHaveLength(2);
    expect(screen.queryByText(/Can't load/)).not.toBeInTheDocument();
  });

  it("starts open only the rows that limit: row security open, blocked shown, two full-access tables folded", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID, ACCOUNTS_ID, INVOICES_ID],
      dashboardQuery: {
        decision: "limited",
        data: { "card-count": 2, "blocked-card-count": 1 },
      },
    });

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "Sandy Sales can open this dashboard but can't see 1 of its 2 cards.",
    );
    expect(getToggle("Orders · Sample Database")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(getVisibleTexts("Rules set by Sales")).toHaveLength(1);
    // a blocked table has no attributes to fold: it's a line of its own, always shown
    expect(getRowStatus("Reviews · Sample Database")).toHaveTextContent(
      "Blocked",
    );
    expect(getRowStatus("Reviews · Sample Database")).not.toHaveAttribute(
      "aria-expanded",
    );
    expect(getToggle("2 tables")).toHaveAttribute("aria-expanded", "false");
    expect(getVisibleTexts("Accounts")).toHaveLength(0);

    await userEvent.click(getToggle("2 tables"));

    await waitFor(() => expect(getVisibleTexts("Accounts")).toHaveLength(1));
  });

  it("shows a single full-access table as a row of its own, not a fold of one", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });

    expect(await findRowStatus("Accounts · Sample Database")).toHaveTextContent(
      "Full access",
    );
    expect(screen.queryByText("1 table")).not.toBeInTheDocument();
  });

  it("names the database after each table's name in the Data section, dimmed on the same line", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID, ACCOUNTS_ID],
    });
    await screen.findByText("Data in this dashboard");

    expect(
      within(getToggle("Orders · Sample Database")).getByText(
        "· Sample Database",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        await screen.findByRole("group", { name: "Reviews · Sample Database" }),
      ).getByText("· Sample Database"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "Accounts · Sample Database" }),
      ).getByText("· Sample Database"),
    ).toBeInTheDocument();
  });

  it("names the database after each table's name in All permissions", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });
    await userEvent.click(await findAllPermissions());

    expect(
      within(
        await screen.findByRole("group", {
          name: "Orders · Sample Database View data",
        }),
      ).getByText("· Sample Database"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", {
          name: "Reviews · Sample Database View data",
        }),
      ).getByText("· Sample Database"),
    ).toBeInTheDocument();
  });

  it("names the database after the table's name in the table's detail title, before who it's for", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });

    await userEvent.click(await findRowStatus("Reviews · Sample Database"));

    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("· Sample Database")).toBeInTheDocument();
    expect(screen.getByText("as Sandy Sales")).toBeInTheDocument();
  });

  it("names the database after each table in Create queries' list of tables", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Varies by table/ }),
    );

    expect(screen.getAllByText("· Sample Database")).toHaveLength(2);
  });

  it("names the database after each table in See everything: Rows filtered, Blocked, and the Can view fold", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (4)"));

    expect(await findToggle("Orders · Sample Database")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Reviews · Sample Database" }),
    ).toBeInTheDocument();
    await userEvent.click(getToggle("2 tables"));
    expect(
      await screen.findByRole("group", {
        name: "Accounts · Sample Database from Sales",
      }),
    ).toBeInTheDocument();
  });

  it("names a sandboxed table's status Rows filtered in See everything's Tables, and Can view for the rest", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (4)"));
    await userEvent.click(await findToggle("2 tables"));

    // the Tables header's counts say it too, so skip the buttons that fold
    const orders = (
      await screen.findAllByRole("button", { name: /Rows filtered/ })
    ).find((button) => !button.hasAttribute("aria-expanded"));

    expect(orders).toHaveTextContent("Rows filtered");
    expect(orders).not.toHaveTextContent("Row and column security");
    expect(
      await findRowStatus("Accounts · Sample Database from Sales"),
    ).toHaveTextContent("Can view");
  });

  it("counts a table with two groups' row security as Can't load in See everything, not Rows filtered", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, PRODUCTS],
    });
    await openSeeEverything();

    expect(
      within(getFold("Tables (2)")).getByText("1 Rows filtered · 1 Can't load"),
    ).toBeInTheDocument();
  });

  it("starts every See everything section folded, with its counts per status under its name", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      mainCollections: {
        ...COLLECTIONS,
        collections: [
          ...COLLECTIONS.collections,
          getCollection(17, "Product templates", 1, "none"),
          getCollection(18, "Onboarding kit", 1, "none"),
        ],
      },
    });
    await openSeeEverything();

    const folds = [getFold("Collections (4)"), getFold("Tables (4)")];
    expect(
      within(folds[0]).getByText("1 Curate · 1 View · 2 No access"),
    ).toBeInTheDocument();
    expect(
      within(folds[1]).getByText("1 Rows filtered · 1 Blocked · 2 Can view"),
    ).toBeInTheDocument();
    for (const fold of folds) {
      expect(fold).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByText("Has access to")).not.toBeInTheDocument();
    expect(screen.queryByText("Filtered rows")).not.toBeInTheDocument();
  });

  it("lists the collections they can't open in Collections, after the ones they can", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      mainCollections: {
        ...COLLECTIONS,
        collections: [
          getCollection(17, "Product templates", 1, "none"),
          ...COLLECTIONS.collections,
        ],
      },
    });
    await openSeeEverything();
    await userEvent.click(getFold("Collections (3)"));

    const blocked = await screen.findByText("Product templates");
    const open = screen.getByText("Sales reports");
    expect(
      open.compareDocumentPosition(blocked) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/^Can't access/)).not.toBeInTheDocument();
  });

  it("leaves No access out of the Collections counts when no collection is blocked, though a table is", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();

    expect(
      within(getFold("Collections (2)")).getByText("1 Curate · 1 View"),
    ).toBeInTheDocument();
    expect(
      within(getFold("Tables (4)")).getByText(/1 Blocked/),
    ).toBeInTheDocument();
  });

  it("indents a section's rows by the xl step (24px), so they start under the section's name, not its chevron", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (4)"));

    const toggle = await findToggle("Orders · Sample Database");
    /* eslint-disable testing-library/no-node-access */
    const sectionContent = getFold("Tables (4)").nextElementSibling
      ?.firstElementChild as HTMLElement;
    /* eslint-enable testing-library/no-node-access */
    expect(sectionContent).toContainElement(toggle);
    expect(sectionContent).toHaveStyle({
      paddingLeft: "var(--mantine-spacing-xl)",
    });
  });

  it("gives a Blocked table a chevron-wide slot before its name, so it lines up with a filtered table that opens in place", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (4)"));

    const reviews = await findRowStatus("Reviews · Sample Database");
    /* eslint-disable testing-library/no-node-access */
    const slot = reviews.closest("[role='group']")?.firstElementChild;
    /* eslint-enable testing-library/no-node-access */
    expect(slot).toBeEmptyDOMElement();
    expect(slot).toHaveStyle({ width: "1rem" });
  });

  it("puts every table in Tables, Blocked ones too, with the filtered one opening to its rules", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (4)"));

    const reviews = await findRowStatus("Reviews · Sample Database");
    expect(reviews).toHaveTextContent("Blocked");
    expect(reviews).not.toHaveAttribute("aria-expanded");
    expect(getToggle("Orders · Sample Database")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(getVisibleTexts("Rules set by Sales")).toHaveLength(0);

    await userEvent.click(getToggle("Orders · Sample Database"));

    await waitFor(() =>
      expect(getVisibleTexts("Rules set by Sales")).toHaveLength(1),
    );
    expect(getToggle("2 tables")).toHaveAttribute("aria-expanded", "false");
  });

  it("folds two or more Blocked tables into one closed row beside the Can view fold, and opens each one's detail from the opened row", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, REVIEWS, FEEDBACK, PEOPLE, ACCOUNTS, INVOICES],
    });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (6)"));

    const blocked = await findToggle("3 tables");
    const viewable = getToggle("2 tables");
    const blockedRow = getToggleRow(blocked);
    /* eslint-disable testing-library/no-node-access */
    const level = blockedRow.parentElement?.parentElement;
    expect(level).toBeInTheDocument();
    expect(level).toBe(getToggleRow(viewable).parentElement?.parentElement);
    /* eslint-enable testing-library/no-node-access */
    expect(within(blockedRow).getByText("Blocked")).toBeInTheDocument();
    expect(blocked).toHaveAttribute("aria-expanded", "false");
    expect(getVisibleTexts("Reviews")).toHaveLength(0);

    await userEvent.click(blocked);
    await userEvent.click(await findRowStatus("Reviews · Sample Database"));

    expect(
      screen.getByText(
        "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
  });

  it("folds two or more tables that can't load into one closed row, each opening to its reason", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, PRODUCTS, EVENTS],
    });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (3)"));

    const cannotLoad = await findToggle("2 tables");
    expect(
      within(getToggleRow(cannotLoad)).getByText("Can't load"),
    ).toBeInTheDocument();
    expect(cannotLoad).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(cannotLoad);
    await userEvent.click(await findToggle("Products · Sample Database"));

    expect(
      await screen.findByText(
        "Sales and Finance readers both set row and column security on Products. Keep one policy, or give one of the groups Can view on Products.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a single table that can be viewed as a row of its own in See everything, not a fold of one", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tables: [ORDERS, ACCOUNTS],
    });
    await openSeeEverything();
    await userEvent.click(getFold("Tables (2)"));

    expect(
      await findRowStatus("Accounts · Sample Database from Sales"),
    ).toHaveTextContent("Can view");
    expect(screen.queryByText("1 table")).not.toBeInTheDocument();
    // a status nobody has is left out of the counts
    expect(
      within(getFold("Tables (2)")).getByText("1 Rows filtered · 1 Can view"),
    ).toBeInTheDocument();
  });

  it("names no group under a collection in See everything, as it still does on All collections", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await openSeeEverything();
    await userEvent.click(getFold("Collections (2)"));

    expect(
      await screen.findByRole("group", { name: "Sales reports" }),
    ).toBeInTheDocument();
    expect(getVisibleTexts("from Sales")).toHaveLength(0);
  });

  it("toggles a row from its name, and opens the table's detail from its status", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await screen.findByText("Data in this dashboard");

    // the status is a button of its own, outside the row's toggle
    expect(getToggle("Orders · Sample Database")).not.toHaveTextContent(
      "Rows filtered",
    );
    await userEvent.click(getToggle("Orders · Sample Database"));
    expect(getToggle("Orders · Sample Database")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("Data in this dashboard")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Rows filtered/ }),
    );

    expect(
      screen.getByText(
        "Sandy Sales sees only the Orders rows that match the user attributes below.",
      ),
    ).toBeInTheDocument();
  });

  it("opens a blocked table's detail from its line", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });

    await userEvent.click(await findRowStatus("Reviews · Sample Database"));

    expect(
      screen.getByText(
        "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
  });

  it("opens a full-access table's detail from the opened fold", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID, INVOICES_ID],
    });
    await screen.findByText("Data in this dashboard");
    await userEvent.click(getToggle("2 tables"));

    await userEvent.click(await findRowStatus("Accounts · Sample Database"));

    expect(
      screen.getByText(
        "Sandy Sales has View data set to Can view on Sample Database / Accounts, from Sales.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the collection's detail from its value", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    await userEvent.click(
      await findRowStatus("Collection Sales reports from Sales"),
    );

    expect(
      screen.getByText(
        "Sandy Sales has Curate access to the Sales reports collection, from Sales.",
      ),
    ).toBeInTheDocument();
  });

  it("opens Create queries: the result, each table's value, and the group that applies", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Varies by table/ }),
    );

    expect(screen.getByText("Create queries")).toBeInTheDocument();
    expect(
      screen.getByText("Sandy Sales can't explore Reviews."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sandy Sales can explore Orders with the query builder, but not with native queries, from Sales.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Applies")).toBeInTheDocument();
    expect(
      screen.getByText("The most permissive group applies."),
    ).toBeInTheDocument();
  });

  it("opens Create queries from its line in All permissions too", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });
    await userEvent.click(await findAllPermissions());

    await userEvent.click(
      await findRowStatus("Orders · Sample Database Create queries"),
    );

    expect(
      screen.getByText(
        "Sandy Sales can explore Orders with the query builder, but not with native queries, from Sales.",
      ),
    ).toBeInTheDocument();
  });

  it("names a table's row security Rows filtered in All permissions, as the Data section does", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
    });
    await userEvent.click(await findAllPermissions());

    const status = await findRowStatus("Orders · Sample Database View data");

    expect(status).toHaveTextContent("Rows filtered");
    expect(status).not.toHaveTextContent("Row and column security");
  });

  it("folds every permission away, Create queries included, until asked", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });
    const disclosure = await findAllPermissions();
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(getVisibleTexts("Create queries")).toHaveLength(0);

    await userEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await waitFor(() =>
      expect(getVisibleTexts("Create queries")).toHaveLength(2),
    );
  });

  it("leaves out All permissions when the cards above show every one: a collection and one table", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await screen.findByText("Exploring this dashboard");

    expect(
      screen.queryByRole("button", { name: /All permissions/ }),
    ).not.toBeInTheDocument();
  });

  it("gives the See everything summary no icon, even with a table blocked, while the partly blocked dashboard keeps its own", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, REVIEWS_ID],
      dashboardQuery: {
        decision: "limited",
        data: { "card-count": 2, "blocked-card-count": 1 },
      },
    });
    expect(
      within(await screen.findByTestId("why-verdict")).getByRole("img"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByText("See everything Sandy Sales can access"),
    );

    const summary = await screen.findByTestId("why-verdict");
    expect(summary).toHaveTextContent("Sandy Sales can open");
    expect(within(summary).queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps All permissions open after opening one of its lines and going Back", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });
    await userEvent.click(await findAllPermissions());
    await userEvent.click(
      await findRowStatus("Orders · Sample Database View data"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(await findAllPermissions()).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a table row folded and the full-access fold open after opening a detail and going Back", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID, INVOICES_ID],
    });
    await screen.findByText("Data in this dashboard");
    await userEvent.click(getToggle("Orders · Sample Database"));
    await userEvent.click(getToggle("2 tables"));
    await userEvent.click(await findRowStatus("Accounts · Sample Database"));

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(getToggle("Orders · Sample Database")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(getToggle("2 tables")).toHaveAttribute("aria-expanded", "true");
  });

  it("goes Back to where the page was scrolled, with the detail opened at its top", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await screen.findByText("Data in this dashboard");
    const scrollContainer = getScrollContainer();
    scrollContainer.scrollTop = 120;

    await userEvent.click(getRowStatus("Collection Sales reports from Sales"));
    expect(scrollContainer.scrollTop).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(scrollContainer.scrollTop).toBe(120);
  });

  // a guard: the kept rows mustn't outlive the sheet
  it("folds All permissions again when the sheet closes and opens", async () => {
    const { rerender } = setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });
    await userEvent.click(await findAllPermissions());
    const props = getProps({ type: "dashboard", id: SALES_OVERVIEW_ID });

    rerender(<WhyListSidesheet {...props} isOpen={false} />);
    rerender(<WhyListSidesheet {...props} />);

    expect(await findAllPermissions()).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("folds All permissions again when another item opens", async () => {
    const { rerender } = setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });
    await userEvent.click(await findAllPermissions());

    rerender(
      <WhyListSidesheet
        {...getProps({ type: "collection", id: SALES_REPORTS_ID })}
      />,
    );
    await screen.findByText("Sandy Sales can curate this collection.");
    rerender(
      <WhyListSidesheet
        {...getProps({ type: "dashboard", id: SALES_OVERVIEW_ID })}
      />,
    );

    expect(await findAllPermissions()).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  // a guard: the frame now reports each collection it opens, and the sheet follows the item it's given
  it("follows the collection the page opens", async () => {
    const { rerender } = setup({
      openedItem: { type: "collection", id: SALES_REPORTS_ID },
    });
    expect(
      await screen.findByText("Sandy Sales can curate this collection."),
    ).toBeInTheDocument();

    rerender(
      <WhyListSidesheet
        {...getProps({ type: "collection", id: Q4_PIPELINE_ID })}
      />,
    );

    expect(await screen.findByText("Q4 pipeline")).toBeInTheDocument();
    const verdict = screen.getByTestId("why-verdict");
    expect(
      within(verdict).getByText("Sandy Sales can view this collection."),
    ).toBeInTheDocument();
    // the group the access comes from is a line of its own, not part of the sentence
    expect(within(verdict).getByText("from Sales")).toBeInTheDocument();
  });

  it("says on hover or focus where a collection's access comes from", async () => {
    setup({ openedItem: { type: "collection", id: SALES_REPORTS_ID } });
    const info = await screen.findByRole("button", {
      name: "About collection permissions",
    });

    await userEvent.hover(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "People get the most permissive collection access across all of their groups. Dashboards and questions in this collection get the same access. Open a dashboard or question to see which tables it uses.",
    );
    await userEvent.unhover(info);
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );

    act(() => info.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "People get the most permissive collection access",
    );
  });

  it("answers a collection in one verdict line, whose status opens the why, with no card under it", async () => {
    setup({ openedItem: { type: "collection", id: SALES_REPORTS_ID } });
    const verdict = await screen.findByTestId("why-verdict");
    expect(verdict).toHaveTextContent(
      "Sandy Sales can curate this collection.",
    );
    expect(
      screen.queryByText("Opening this collection"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(verdict).getByRole("button", { name: /Curate/ }),
    );

    expect(
      screen.getByText(
        "Sandy Sales has Curate access to the Sales reports collection, from Sales.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Explain access")).toBeInTheDocument();
  });

  it("names a tenant user's personal collection, says they curate it, and gives the reason in its detail", async () => {
    setup({
      openedItem: { type: "collection", id: PERSONAL_COLLECTION_ID },
      mainCollections: {
        ...NO_COLLECTIONS,
        collections: [
          {
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
          },
        ],
      },
    });
    const verdict = await screen.findByTestId("why-verdict");
    expect(verdict).toHaveTextContent(
      "Sandy Sales can curate this collection.",
    );
    expect(
      screen.getByText("Sandy Sales's personal collection"),
    ).toBeInTheDocument();
    expect(verdict).not.toHaveTextContent(
      "Everyone has Curate access to their own personal collection, whatever their groups.",
    );

    await userEvent.click(
      within(verdict).getByRole("button", { name: /Curate/ }),
    );

    expect(
      screen.getByText(
        "Everyone has Curate access to their own personal collection, whatever their groups.",
      ),
    ).toBeInTheDocument();
  });

  it("shows in the page as a panel named Explain access, not a sheet over it, with Back and Close", async () => {
    const onClose = jest.fn();
    setup({
      openedItem: { type: "collection", id: SALES_REPORTS_ID },
      isInPage: true,
      onClose,
    });
    const panel = await screen.findByRole("complementary", {
      name: "Explain access",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      within(await within(panel).findByTestId("why-verdict")).getByRole(
        "button",
        { name: /Curate/ },
      ),
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Back" }));
    expect(await within(panel).findByTestId("why-verdict")).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("gives the panel the side sheet's 24px inset and a 32px close button, whatever the window's width", async () => {
    setup({
      openedItem: { type: "collection", id: SALES_REPORTS_ID },
      isInPage: true,
    });
    const panel = await screen.findByRole("complementary", {
      name: "Explain access",
    });

    const closeButton = within(panel).getByRole("button", { name: "Close" });
    expect(closeButton).toHaveStyle({ width: "2rem", height: "2rem" });
    // the panel is its header, then its scrolling body; neither has a role or label to find it by
    // eslint-disable-next-line testing-library/no-node-access
    expect(panel.firstElementChild).toHaveStyle({
      paddingInline: "var(--mantine-spacing-xl)",
      paddingTop: "var(--mantine-spacing-xl)",
    });
    // eslint-disable-next-line testing-library/no-node-access
    expect(panel.lastElementChild).toHaveStyle({
      paddingInline: "var(--mantine-spacing-xl)",
      paddingBottom: "var(--mantine-spacing-xl)",
    });
  });

  it("makes the panel 30rem wide, as wide as the side sheet below 1280px", async () => {
    setup({
      openedItem: { type: "collection", id: SALES_REPORTS_ID },
      isInPage: true,
    });

    expect(
      await screen.findByRole("complementary", { name: "Explain access" }),
    ).toHaveStyle({ width: "30rem" });
  });

  it("keeps the See everything arrow beside the link's first line, in a box one text line tall", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    const text = await screen.findByText(
      "See everything Sandy Sales can access",
    );
    // the link is an arrow box then the words; neither has a role or label to find it by
    // eslint-disable-next-line testing-library/no-node-access
    const link = text.parentElement as HTMLElement;
    expect(link).toHaveStyle({ alignItems: "flex-start" });
    // eslint-disable-next-line testing-library/no-node-access
    expect(link.firstElementChild).toHaveStyle({ height: "1lh" });
  });

  it("pads an opened row's content by the sm step (8px), so the first attribute doesn't touch the row's hover band", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    const toggle = await findToggle("Orders · Sample Database");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // the opened content is the row's last box, inside its Collapse
    /* eslint-disable testing-library/no-node-access */
    const row = toggle.parentElement?.parentElement as HTMLElement;
    // the row always has its Collapse and the box inside it; the cast drops the null from the chain
    const content = row.lastElementChild?.firstElementChild as HTMLElement;
    /* eslint-enable testing-library/no-node-access */
    expect(content).toHaveTextContent("Rules set by Sales");
    expect(content).toHaveStyle({
      paddingTop: "var(--mantine-spacing-sm)",
      // the chips start under the row's name: its 16px chevron plus the 8px gap
      paddingLeft: "var(--mantine-spacing-xl)",
    });
  });

  it("pulls a card's rows up by their hover band, so the rows sit 8px under the title and 24px above the card's edge", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });

    const [openingRows, dataRows, exploringRows] =
      await screen.findAllByTestId("card-rows");

    for (const rows of [openingRows, dataRows, exploringRows]) {
      expect(rows).toHaveStyle({
        marginBlock: "calc(var(--mantine-spacing-sm) * -1)",
      });
    }
    expect(
      within(openingRows).getByRole("group", { name: /Sales reports/ }),
    ).toBeInTheDocument();
    expect(
      within(dataRows).getByRole("button", { name: /Orders/ }),
    ).toBeInTheDocument();
    expect(
      within(exploringRows).getByRole("group", { name: /Orders/ }),
    ).toBeInTheDocument();
  });

  it("pulls the collections' rows up by their hover band too", async () => {
    setup({
      openedItem: null,
      isAllCollections: true,
      mainCollections: {
        ...COLLECTIONS,
        collections: [getCollection("root", "Our analytics", 0, "read")],
      },
    });

    expect(await screen.findByTestId("card-rows")).toHaveStyle({
      marginBlock: "calc(var(--mantine-spacing-sm) * -1)",
    });
  });

  it("lists on All collections only the collections the page lists, with the person's whole access behind See everything", async () => {
    setup({
      openedItem: null,
      isAllCollections: true,
      mainCollections: {
        ...COLLECTIONS,
        collections: [
          getCollection("root", "Our analytics", 0, "read"),
          ...COLLECTIONS.collections,
        ],
      },
      sharedCollections: {
        ...COLLECTIONS,
        collections: [
          getCollection("root", "Shared collections", 0, "read"),
          getCollection(18, "Onboarding kit", 1, "write"),
          getCollection(17, "Product templates", 1, "none"),
        ],
      },
    });

    expect(await screen.findByText("All collections")).toBeInTheDocument();
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(getVisibleTexts("Our analytics")).toHaveLength(1);
    expect(getVisibleTexts("Onboarding kit")).toHaveLength(1);
    // inside Our analytics, so the page doesn't list it
    expect(screen.queryByText("Sales reports")).not.toBeInTheDocument();
    expect(screen.queryByText("Product templates")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared collections")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByText("See everything Sandy Sales can access"),
    );

    // Product templates, which they can't open, too; the Reviews table is in Tables
    expect(
      await screen.findByRole("button", { name: /Collections \(6\)/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves a tenant user's list without internal collections or another tenant's collection", async () => {
    setup({
      openedItem: null,
      isAllCollections: true,
      mainCollections: NO_COLLECTIONS,
      tenantCollections: {
        ...COLLECTIONS,
        collections: [
          {
            ...getCollection(9, "Tenant Collection: Acme", 0, "write"),
            source: "tenant",
          },
          {
            ...getCollection(12, "Tenant Collection: Globex", 0, "none"),
            source: "other-tenant",
          },
        ],
      },
    });

    expect(
      await screen.findByText("Tenant Collection: Acme"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sales reports")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Tenant Collection: Globex"),
    ).not.toBeInTheDocument();
  });
});

type SetupOpts = {
  /** Null on a page with no item: "All collections" with `isAllCollections`. */
  openedItem: OpenedItem | null;
  isAllCollections?: boolean;
  isInPage?: boolean;
  onClose?: () => void;
  /** Sales reports' collection access, "write" (Curate) unless given. */
  salesReportsAccess?: string;
  /** Each tab's collections: the main tab's Sales reports and Q4 pipeline, and no shared or tenant tab, unless given. */
  mainCollections?: PreviewCollectionsResponse;
  sharedCollections?: PreviewCollectionsResponse;
  tenantCollections?: PreviewCollectionsResponse;
  /** The opened dashboard's name, Sales overview unless given. */
  dashboardName?: string;
  /** The tables the person's databases hold, Orders, Reviews, Accounts and Invoices unless given. */
  tables?: PreviewTableAccess[];
  /** The tables the dashboard uses, Orders unless given. */
  tableIds?: number[];
  /** Whether the dashboard opens, and whether its cards load; both allowed unless given. */
  dashboardRead?: PermissionDebugResponse;
  dashboardQuery?: PermissionDebugResponse;
  /** How the sheet names the person, Sandy Sales unless given. */
  whoName?: string;
  sentenceWhoName?: string;
  /** What the preview is of, Sandy Sales unless given. */
  preview?: WhyPreview;
};

function setup({
  openedItem,
  isAllCollections,
  isInPage,
  onClose = jest.fn(),
  salesReportsAccess = "write",
  mainCollections = {
    ...COLLECTIONS,
    collections: COLLECTIONS.collections.map((collection) =>
      collection.id === SALES_REPORTS_ID
        ? { ...collection, access: getCell(salesReportsAccess) }
        : collection,
    ),
  },
  sharedCollections = NO_COLLECTIONS,
  tenantCollections = NO_COLLECTIONS,
  dashboardName = SALES_OVERVIEW.name,
  tables = DATA.databases[0].tables,
  tableIds = [ORDERS_ID],
  dashboardRead = ALLOW,
  dashboardQuery = ALLOW,
  whoName = "Sandy Sales",
  sentenceWhoName = whoName,
  preview,
}: SetupOpts) {
  setupPermissionPreviewCollectionsEndpoint("default", mainCollections);
  setupPermissionPreviewCollectionsEndpoint("shared", sharedCollections);
  setupPermissionPreviewCollectionsEndpoint("tenant", tenantCollections);
  fetchMock.get("path:/api/ee/permission_debug/preview/item-scope", {
    ...SALES_OVERVIEW,
    name: dashboardName,
    table_ids: tableIds,
  });
  setupPermissionPreviewDataEndpoint({
    ...DATA,
    databases: [{ ...DATA.databases[0], tables }],
  });
  setupPermissionDebugEndpoint(
    {
      userId: SANDY.id,
      modelId: SALES_OVERVIEW_ID,
      actionType: "dashboard/read",
    },
    dashboardRead,
  );
  setupPermissionDebugEndpoint(
    {
      userId: SANDY.id,
      modelId: SALES_OVERVIEW_ID,
      actionType: "dashboard/query",
    },
    dashboardQuery,
  );
  [SALES_REPORTS_ID, Q4_PIPELINE_ID, PERSONAL_COLLECTION_ID].forEach(
    (collectionId) =>
      setupPermissionDebugEndpoint(
        {
          userId: SANDY.id,
          modelId: collectionId,
          actionType: "collection/read",
        },
        ALLOW,
      ),
  );

  return renderWithProviders(
    <WhyListSidesheet
      {...getProps(openedItem)}
      {...(preview != null && { preview })}
      whoName={whoName}
      sentenceWhoName={sentenceWhoName}
      isAllCollections={isAllCollections}
      isInPage={isInPage}
      onClose={onClose}
    />,
  );
}

function getProps(openedItem: OpenedItem | null) {
  return {
    isOpen: true,
    preview: { principalType: "user" as const, userId: SANDY.id },
    whoName: "Sandy Sales",
    sentenceWhoName: "Sandy Sales",
    openedItem,
    onClose: jest.fn<void, []>(),
  };
}

function getCollection(
  id: PreviewCollection["id"],
  name: string,
  depth: number,
  access: string,
): PreviewCollection {
  return { id, name, depth, source: "group", access: getCell(access) };
}

/** A row's status, its only button; the row is named by its name and the line under it. */
function getRowStatus(rowName: string) {
  return within(screen.getByRole("group", { name: rowName })).getByRole(
    "button",
  );
}

async function findRowStatus(rowName: string) {
  return within(await screen.findByRole("group", { name: rowName })).getByRole(
    "button",
  );
}

/** All permissions on a dashboard with two tables: one value per table more than the cards above it show. */
function findAllPermissions() {
  return screen.findByRole("button", {
    name: /All permissions \(5\)/,
  });
}

/** The sheet's scrolling box, its body's only child: jsdom doesn't lay out or scroll, so its `scrollTop` keeps whatever is set. */
function getScrollContainer() {
  const container = screen
    .getByTestId("sidesheet")
    // eslint-disable-next-line testing-library/no-node-access -- the scrolling box has no role or label to find it by
    .querySelector<HTMLElement>("[class*=Modal-body] > *");
  if (container == null) {
    throw new Error("The sheet has no scrolling box");
  }
  let scrollTop = 0;
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return container;
}

async function openSeeEverything() {
  await userEvent.click(
    await screen.findByText("See everything Sandy Sales can access"),
  );
  await screen.findByText(/^Tables \(/);
}

/** A See everything section's header, by its name; its counts are under the name. */
function getFold(name: string) {
  const fold = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.hasAttribute("aria-expanded") &&
        within(button).queryByText(name) != null,
    );
  if (fold == null) {
    throw new Error(`No section named ${name} opens in place`);
  }
  return fold;
}

function findToggle(name: string) {
  return waitFor(() => getToggle(name));
}

/** A row that opens in place, by its name. */
function getToggle(name: string) {
  const toggle = screen
    .queryAllByRole("button", { name: new RegExp(`(^| )${name}$`) })
    .find((button) => button.hasAttribute("aria-expanded"));
  if (toggle == null) {
    throw new Error(`No row named ${name} opens in place`);
  }
  return toggle;
}

/** The row that holds a toggle and its status, which sits beside it. */
function getToggleRow(toggle: HTMLElement) {
  // eslint-disable-next-line testing-library/no-node-access -- the status has no role or label to find it by
  const row = toggle.closest("div");
  if (row == null) {
    throw new Error("The toggle is in no row");
  }
  return row;
}

/** The folded list stays mounted while folded, so count only what shows. */
function getVisibleTexts(text: string) {
  return screen
    .queryAllByText(text, { exact: true })
    .filter((element) => isVisible(element));
}

function isVisible(element: HTMLElement) {
  for (
    let current: HTMLElement | null = element;
    current != null;
    current = current.parentElement
  ) {
    if (getComputedStyle(current).display === "none") {
      return false;
    }
  }
  return true;
}

function getCell(value: string): PreviewCell {
  return {
    value,
    group_id: 5,
    groups: [{ group_id: 5, name: "Sales", value }],
    note: null,
  };
}
