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
  ItemDependencies,
  PermissionDebugResponse,
  PreviewCell,
  PreviewCollection,
  PreviewCollectionsResponse,
  PreviewDataResponse,
  PreviewPrincipal,
  PreviewTableAccess,
} from "../api";

import { WhyListSidesheet } from "./WhyListSidesheet";
import type { OpenedItem } from "./item-path";

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

const SALES_OVERVIEW_ID = 12;
const SALES_REPORTS_ID = 14;
const Q4_PIPELINE_ID = 15;
const ORDERS_ID = 2;
const REVIEWS_ID = 3;
const ACCOUNTS_ID = 4;
const INVOICES_ID = 5;
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
  security: {
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
  },
};

const REVIEWS: PreviewTableAccess = {
  ...ORDERS,
  id: REVIEWS_ID,
  name: "REVIEWS",
  display_name: "Reviews",
  view_data: getCell("blocked"),
  create_queries: getCell("no"),
  security: null,
};

const ACCOUNTS: PreviewTableAccess = {
  ...ORDERS,
  id: ACCOUNTS_ID,
  name: "ACCOUNTS",
  display_name: "Accounts",
  view_data: getCell("unrestricted"),
  security: null,
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

  it("leads a partly blocked dashboard with the card that can't load and its blocked table, which its status opens", async () => {
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

    const cardsHeading = await screen.findByText("Cards that can't load");
    expect(
      cardsHeading.compareDocumentPosition(
        screen.getByText("Data in this dashboard"),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Reviews by rating")).toBeInTheDocument();
    expect(screen.getByText("Reviews table blocked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Can't load/ }));

    expect(
      screen.getByText(
        "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
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
    expect(getToggle("Orders")).toHaveAttribute("aria-expanded", "true");
    expect(getVisibleTexts("Rules set by Sales")).toHaveLength(1);
    // a blocked table has no attributes to fold: it's a line of its own, always shown
    expect(getRowStatus("Reviews")).toHaveTextContent("Blocked");
    expect(getRowStatus("Reviews")).not.toHaveAttribute("aria-expanded");
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

    expect(await findRowStatus("Accounts")).toHaveTextContent("Full access");
    expect(screen.queryByText("1 table")).not.toBeInTheDocument();
  });

  it("toggles a row from its name, and opens the table's detail from its status", async () => {
    setup({ openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID } });
    await screen.findByText("Data in this dashboard");

    // the status is a button of its own, outside the row's toggle
    expect(getToggle("Orders")).not.toHaveTextContent("Rows filtered");
    await userEvent.click(getToggle("Orders"));
    expect(getToggle("Orders")).toHaveAttribute("aria-expanded", "false");
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

    await userEvent.click(await findRowStatus("Reviews"));

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

    await userEvent.click(await findRowStatus("Accounts"));

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

    await userEvent.click(await findRowStatus("Orders Create queries"));

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

    const status = await findRowStatus("Orders View data");

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
    expect(screen.getByText("Filtered rows")).toBeInTheDocument();
    expect(screen.getByText("Has access to")).toBeInTheDocument();
  });

  it("keeps All permissions open after opening one of its lines and going Back", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID],
    });
    await userEvent.click(await findAllPermissions());
    await userEvent.click(await findRowStatus("Orders View data"));

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(await findAllPermissions()).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a table row folded and the full-access fold open after opening a detail and going Back", async () => {
    setup({
      openedItem: { type: "dashboard", id: SALES_OVERVIEW_ID },
      tableIds: [ORDERS_ID, ACCOUNTS_ID, INVOICES_ID],
    });
    await screen.findByText("Data in this dashboard");
    await userEvent.click(getToggle("Orders"));
    await userEvent.click(getToggle("2 tables"));
    await userEvent.click(await findRowStatus("Accounts"));

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(getToggle("Orders")).toHaveAttribute("aria-expanded", "false");
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

    expect(
      await screen.findByRole("button", { name: /Collections \(5\)/ }),
    ).toHaveAttribute("aria-expanded", "true");
    // Product templates and the Reviews table
    expect(
      screen.getByRole("button", { name: /Can't access \(2\)/ }),
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

  it("starts a tenant preview's sentences with A user of Acme, and keeps a user of Acme mid-sentence", async () => {
    setup({
      openedItem: null,
      isAllCollections: true,
      whoName: "a user of Acme",
      sentenceWhoName: "A user of Acme",
    });

    await userEvent.click(
      await screen.findByText("See everything a user of Acme can access"),
    );

    expect(await screen.findByTestId("why-verdict")).toHaveTextContent(
      "A user of Acme can open",
    );
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
  /** The tables the dashboard uses, Orders unless given. */
  tableIds?: number[];
  /** Whether the dashboard opens, and whether its cards load; both allowed unless given. */
  dashboardRead?: PermissionDebugResponse;
  dashboardQuery?: PermissionDebugResponse;
  /** How the sheet names the person, Sandy Sales unless given. */
  whoName?: string;
  sentenceWhoName?: string;
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
  tableIds = [ORDERS_ID],
  dashboardRead = ALLOW,
  dashboardQuery = ALLOW,
  whoName = "Sandy Sales",
  sentenceWhoName = whoName,
}: SetupOpts) {
  setupPermissionPreviewCollectionsEndpoint("default", mainCollections);
  setupPermissionPreviewCollectionsEndpoint("shared", sharedCollections);
  setupPermissionPreviewCollectionsEndpoint("tenant", tenantCollections);
  fetchMock.get("path:/api/ee/permission_debug/preview/item-scope", {
    ...SALES_OVERVIEW,
    table_ids: tableIds,
  });
  setupPermissionPreviewDataEndpoint(DATA);
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
    preview: { userId: SANDY.id },
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
    name: /All permissions on this dashboard \(5\)/,
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

/** A row that opens in place, by its name. */
function getToggle(name: string) {
  const toggle = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.hasAttribute("aria-expanded") && button.textContent === name,
    );
  if (toggle == null) {
    throw new Error(`No row named ${name} opens in place`);
  }
  return toggle;
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
