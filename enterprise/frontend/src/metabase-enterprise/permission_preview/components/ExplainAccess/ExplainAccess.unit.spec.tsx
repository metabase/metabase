import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import {
  mockTextOverflow,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type {
  PermissionDebugAccess,
  PermissionDebugAction,
  PermissionDebugAnswer,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import type { PreviewTarget } from "../types";

import { ExplainAccess } from "./ExplainAccess";
import {
  createAccess,
  createAnswer,
  createCollection,
  createGroupValue,
  createSandbox,
  createSqlCard,
  createTable,
} from "./fixtures";

const SANDY: PreviewTarget = {
  kind: "user",
  user: createMockUser({ id: 2, common_name: "Sandy Sales" }),
};

const SALES_GROUP: PreviewTarget = {
  kind: "group",
  group: { id: 9, name: "Sales", magic_group_type: null },
};

type Answers = Partial<
  Record<
    PermissionDebugAction,
    PermissionDebugAnswer | Promise<PermissionDebugAnswer>
  >
>;

interface SetupOpts {
  item?: string;
  target?: PreviewTarget;
  answers?: Answers;
  access?: PermissionDebugAccess;
}

function setup({
  item = "question/12",
  target = SANDY,
  answers = {},
  access = createAccess(),
}: SetupOpts = {}) {
  fetchMock.get(
    "path:/api/card/12",
    createMockCard({ id: 12, name: "Orders by state" }),
  );
  fetchMock.get(
    "path:/api/dashboard/3",
    createMockDashboard({ id: 3, name: "Sales overview" }),
  );
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: 5, name: "Sales reports" })],
  });

  fetchMock.get("path:/api/ee/permission_debug/access", access);

  const defaults: Answers = {
    "card/read": createAnswer(),
    "card/query": createAnswer({ reasons: { collection: createCollection() } }),
    "card/download-data": createAnswer({ reasons: {} }),
    "dashboard/read": createAnswer({ "model-type": "dashboard" }),
    "dashboard/query": createAnswer({ "model-type": "dashboard" }),
    "collection/read": createAnswer({ "model-type": "collection" }),
  };
  Object.entries({ ...defaults, ...answers }).forEach(
    ([actionType, answer]) => {
      fetchMock.get({
        url: "path:/api/ee/permission_debug",
        query: { action_type: actionType },
        response: answer,
      });
    },
  );

  const onClose = jest.fn();
  const renderItem = (itemToExplain: string) => (
    <ExplainAccess
      target={target}
      userId={2}
      item={itemToExplain}
      onClose={onClose}
    />
  );
  const { rerender } = renderWithProviders(renderItem(item));
  const showItem = (itemToExplain: string) =>
    rerender(renderItem(itemToExplain));
  return { onClose, showItem };
}

/** The row whose status button is named `statusName` */
function getRow(statusName: string) {
  return checkNotNull(
    screen.getByRole("button", { name: statusName }).parentElement,
  );
}

describe("ExplainAccess", () => {
  it("asks for an item when the frame shows none of them", () => {
    setup({ item: "not-found" });

    expect(
      screen.getByText(
        "Open a question, a dashboard or a collection to see why they can or can't open it.",
      ),
    ).toBeInTheDocument();
  });

  it("is titled Explain access, names the item and the person, and closes", async () => {
    const { onClose } = setup();

    expect(await screen.findByText("Orders by state")).toBeInTheDocument();
    expect(screen.getByText("Explain access")).toBeInTheDocument();
    expect(screen.getByText("as Sandy Sales")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("allowed", () => {
    it("says the person can see the question and names the collection's group", async () => {
      setup();

      expect(
        await screen.findByText("Sandy Sales can see this question."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sales reports, Curate" }),
      ).toBeInTheDocument();
      expect(screen.getByText("from Sales")).toBeInTheDocument();
    });

    it("says a collection is given by rule when no group gives the access", async () => {
      const collection = createCollection({
        name: "Sandy's collection",
        "personal?": true,
        "by-rule": true,
        groups: [createGroupValue("All Users", "none")],
      });
      setup({
        answers: {
          "card/query": createAnswer({ reasons: { collection } }),
          "card/read": createAnswer({ reasons: { collection } }),
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Sandy Sales's personal collection, Curate",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("by rule")).toBeInTheDocument();
    });

    it("explains the collection value with the group that gives it when the status is opened", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      expect(
        screen.getByText(
          "Sandy Sales has Curate access to the Sales reports collection, from Sales.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getByText("Applies")).toBeInTheDocument();
      expect(screen.getByText("No access")).toBeInTheDocument();
      expect(
        screen.getByText("The most permissive group applies."),
      ).toBeInTheDocument();
    });

    it("lists the group that applies first", async () => {
      setup({
        answers: {
          "card/read": createAnswer({
            reasons: {
              collection: createCollection({
                groups: [
                  createGroupValue("All Users", "none"),
                  createGroupValue("Sales", "curate", true),
                ],
              }),
            },
          }),
        },
      });

      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      const names = screen
        .getAllByText(/^(All Users|Sales)$/)
        .map((element) => element.textContent);
      expect(names).toEqual(["Sales", "All Users"]);
    });

    it("says nothing about editing, on the sheet or in the Exploring tooltip", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
            },
          }),
        },
      });

      await userEvent.hover(
        await screen.findByRole("button", { name: "About Create queries" }),
      );

      expect(
        await screen.findByText(
          "Create queries on each table decides whether the person can explore the question's results or start a new question from those results.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Editing this question"),
      ).not.toBeInTheDocument();
    });
  });

  describe("denied", () => {
    const collection = createCollection({
      value: "none",
      groups: [createGroupValue("All Users", "none")],
    });
    const denied = createAnswer({
      decision: "denied",
      outcome: "denied",
      reasons: { collection, tables: [createTable()] },
    });

    it("says only that the person can't open the question, and names the collection with No access", async () => {
      setup({ answers: { "card/read": denied, "card/query": denied } });

      expect(
        await screen.findByText("Sandy Sales can't open this question."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/has no access to its collection/),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Opening this question")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sales reports, No access" }),
      ).toBeInTheDocument();
    });

    it("keeps the other cards of a question the person can't open", async () => {
      setup({
        answers: {
          "card/read": denied,
          "card/query": denied,
          "card/download-data": createAnswer({
            decision: "denied",
            outcome: "denied",
            reasons: {},
          }),
        },
      });

      await screen.findByText("Sandy Sales can't open this question.");

      expect(screen.getByText("Data in this question")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Orders, Full access" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Orders, Query builder only" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Download")).toBeInTheDocument();
      expect(screen.getByText("No downloads")).toBeInTheDocument();
      expect(screen.getByText("All permissions (4)")).toBeInTheDocument();
    });

    it("says the person can open the question but not see its results, and shows the blocked table", async () => {
      const blocked = createTable({
        "view-data": {
          value: "blocked",
          groups: [
            createGroupValue("All Users", "blocked"),
            createGroupValue("Data Analysts", "blocked"),
          ],
        },
      });
      setup({
        answers: {
          "card/query": createAnswer({
            decision: "denied",
            outcome: "denied",
            reasons: { collection: createCollection(), tables: [blocked] },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sandy Sales can open this question but can't see its results.",
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Orders, Blocked" }),
      );

      expect(
        screen.getByText(
          "Sandy Sales is blocked from Sample Database / Orders.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("All Users")).toBeInTheDocument();
      expect(screen.getByText("Data Analysts")).toBeInTheDocument();
      expect(screen.queryByText("Applies")).not.toBeInTheDocument();
    });

    it.each([
      [
        3,
        "Sandy Sales can open this dashboard but can't see 1 of its 3 cards.",
      ],
      [1, "Sandy Sales can open this dashboard but can't see 1 of its 1 card."],
    ])(
      "counts the cards of a dashboard that can't load, out of %s",
      async (total, sentence) => {
        const blocked = createTable({
          name: "Reviews",
          "view-data": {
            value: "blocked",
            groups: [createGroupValue("All Users", "blocked")],
          },
        });
        setup({
          item: "dashboard/3",
          answers: {
            "dashboard/query": createAnswer({
              "model-type": "dashboard",
              decision: "limited",
              outcome: "limited",
              data: { "cards-total": total, "cards-blocked": 1 },
              reasons: {
                collection: createCollection(),
                tables: [
                  blocked,
                  createTable({ "table-id": 2, name: "Orders" }),
                ],
              },
            }),
          },
        });

        expect(await screen.findByText(sentence)).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Reviews, Blocked" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Data in this dashboard")).toBeInTheDocument();
      },
    );
  });

  describe("reshaped", () => {
    const filtered = createTable({
      name: "Products",
      sandboxes: [createSandbox({ "table-id": 1 })],
    });
    const reshaped = {
      "card/query": createAnswer({
        outcome: "reshaped",
        segment: ["sandboxed"],
        reasons: { collection: createCollection(), tables: [filtered] },
      }),
    };

    it("shows each filter as attribute, value and column, with the group that set it", async () => {
      setup({ answers: reshaped });

      expect(
        await screen.findByRole("button", {
          name: "Products, Rows filtered",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("category")).toBeInTheDocument();
      expect(screen.getByText("Gizmo")).toBeInTheDocument();
      expect(screen.getByText("→ Products.Category")).toBeInTheDocument();
      expect(screen.getByText("Rules set by Sales")).toBeInTheDocument();
    });

    it("shows the rule and the groups when the status is opened", async () => {
      setup({ answers: reshaped });

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Products, Rows filtered",
        }),
      );

      expect(
        screen.getByText(
          "Sandy Sales sees only the Products rows that match the user attributes below.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Row and column security")).toBeInTheDocument();
      expect(screen.getByText("Set by")).toBeInTheDocument();
      expect(screen.getByText("All columns")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getAllByText("Rows filtered").at(-1)).toBeVisible();
      expect(screen.getByText("Blocked")).toBeInTheDocument();
    });

    it("names the role a connection impersonation uses", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "reshaped",
            segment: ["impersonated"],
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
              impersonations: [
                {
                  "db-id": 1,
                  "db-name": "Sample Database",
                  "group-id": 9,
                  "group-name": "Sales",
                  attribute: "role",
                  value: "analyst_role",
                  "missing?": false,
                  "enforced?": true,
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sample Database: connects as the role analyst_role, set by role.",
        ),
      ).toBeInTheDocument();
    });

    it("shows the database a route picks and the attribute that picks it", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "reshaped",
            segment: ["routed"],
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
              routes: [
                {
                  "db-id": 1,
                  "db-name": "Sample Database",
                  attribute: "destination",
                  value: "tenant-a",
                  status: "routed",
                  "destination-id": 7,
                  "destination-name": "tenant-a",
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sample Database: queries go to tenant-a, picked by destination = tenant-a.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("download", () => {
    const withTable = createAnswer({
      reasons: { collection: createCollection(), tables: [createTable()] },
    });

    it("is one row after Exploring and before All permissions, closed at first", async () => {
      setup({ answers: { "card/query": withTable } });

      const download = await screen.findByText("Download");

      expect(
        screen
          .getByText("Exploring this question")
          .compareDocumentPosition(download),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        download.compareDocumentPosition(
          screen.getByText("All permissions (4)"),
        ),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.queryByText("Downloading")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Orders, Up to 1 million rows" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ["allow", "Up to 1 million rows", "They can download the full result."],
      [
        "limited",
        "Up to 10,000 rows",
        "Their downloads are capped below the full result.",
      ],
      ["denied", "No downloads", "They can't download these results."],
    ] as const)(
      "shows the outcome of a download decided %s, and its sentence once opened",
      async (decision, outcome, sentence) => {
        setup({
          answers: {
            "card/query": withTable,
            "card/download-data": createAnswer({ decision, reasons: {} }),
          },
        });

        const download = await screen.findByText("Download");
        expect(screen.getByText(outcome)).toBeInTheDocument();
        expect(screen.queryByText(sentence)).not.toBeInTheDocument();

        await userEvent.click(download);

        expect(screen.getByText(sentence)).toBeInTheDocument();
      },
    );

    it("opens a table's download value to the groups that decide it", async () => {
      setup({ answers: { "card/query": withTable } });
      await userEvent.click(await screen.findByText("Download"));

      await userEvent.click(
        screen.getByRole("button", { name: "Orders, Up to 1 million rows" }),
      );

      expect(
        screen.getByText(
          "Sandy Sales has Download results set to Up to 1 million rows on Orders, from Sales.",
        ),
      ).toBeVisible();
      expect(screen.getByText("Groups")).toBeVisible();
    });

    it("has no Download row on a dashboard", async () => {
      setup({
        item: "dashboard/3",
        answers: {
          "dashboard/query": createAnswer({
            "model-type": "dashboard",
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
            },
          }),
        },
      });

      expect(
        await screen.findByText("Data in this dashboard"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Download")).not.toBeInTheDocument();
    });

    it("shows no verdict until the download answer has arrived", async () => {
      const download = defer<PermissionDebugAnswer>();
      setup({
        answers: {
          "card/query": withTable,
          "card/download-data": download.promise,
        },
      });
      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("path:/api/ee/permission_debug"),
        ).toHaveLength(3),
      );

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(
        screen.queryByText("Sandy Sales can see this question."),
      ).not.toBeInTheDocument();

      download.resolve(createAnswer({ reasons: {} }));

      expect(await screen.findByText("Download")).toBeInTheDocument();
      expect(
        screen.getByText("Sandy Sales can see this question."),
      ).toBeInTheDocument();
    });
  });

  describe("broken", () => {
    it("says queries fail for a group and names the missing attribute and the fix", async () => {
      const table = createTable({
        name: "Products",
        sandboxes: [
          createSandbox({
            filters: [
              {
                attribute: "state",
                value: null,
                column: "People.State",
                "missing?": true,
              },
            ],
          }),
        ],
      });
      setup({
        target: SALES_GROUP,
        answers: {
          "card/query": createAnswer({
            outcome: "broken",
            reasons: {
              collection: createCollection(),
              tables: [table],
              problems: [
                {
                  type: "missing-attribute",
                  attribute: "state",
                  "table-id": 1,
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText("Queries fail for a member of Sales."),
      ).toBeInTheDocument();
      expect(screen.getByText("as a member of Sales")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Products, Can't load" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Members of Sales need the attribute state (rule set by Sales). Pick a value for it in the preview to see their view.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("No value")).toBeInTheDocument();
    });

    it("tells a user where to set the missing attribute", async () => {
      const table = createTable({
        sandboxes: [
          createSandbox({
            filters: [
              {
                attribute: "state",
                value: null,
                column: "People.State",
                "missing?": true,
              },
            ],
          }),
        ],
      });
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "broken",
            reasons: {
              collection: createCollection(),
              tables: [table],
              problems: [
                {
                  type: "missing-attribute",
                  attribute: "state",
                  "table-id": 1,
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sales needs the attribute state, which Sandy Sales doesn't have. Set it on Sandy Sales in Admin › People, or in their sign-in provider.",
        ),
      ).toBeInTheDocument();
    });

    it("says every query fails for a route with no value", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "broken",
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
              routes: [
                {
                  "db-id": 1,
                  "db-name": "Sample Database",
                  attribute: "destination",
                  value: null,
                  status: "missing-value",
                  "destination-id": null,
                  "destination-name": null,
                },
              ],
              problems: [
                {
                  type: "routing-missing-value",
                  attribute: "destination",
                  "db-id": 1,
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sample Database: every query fails: no value for destination.",
        ),
      ).toBeInTheDocument();
    });

    it("explains two groups' row and column security on one table", async () => {
      const table = createTable({
        sandboxes: [
          createSandbox({ "sandbox-id": 1, "group-name": "Sales" }),
          createSandbox({ "sandbox-id": 2, "group-name": "Support" }),
        ],
      });
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "broken",
            reasons: {
              collection: createCollection(),
              tables: [table],
              problems: [
                {
                  type: "conflicting-sandboxes",
                  "table-id": 1,
                  "group-ids": [9, 10],
                },
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sales and Support both set row and column security on Orders. Keep one policy, or give one of the groups Can view on Orders.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("steps that have their own rows", () => {
    it("folds tables with the same create-queries value into one row", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                createTable({ "table-id": 1, name: "Orders" }),
                createTable({ "table-id": 2, name: "Products" }),
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Orders, Products, Query builder only",
        }),
      ).toBeInTheDocument();
    });

    it("folds two tables with full access into one row, closed at first", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                createTable({ "table-id": 1, name: "Orders" }),
                createTable({ "table-id": 2, name: "Products" }),
              ],
            },
          }),
        },
      });

      const fold = await screen.findByRole("button", { name: /2 tables/ });
      expect(screen.getAllByText("Full access")).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "Orders, Full access" }),
      ).not.toBeInTheDocument();

      await userEvent.click(fold);

      expect(
        screen.getByRole("button", { name: "Orders, Full access" }),
      ).toBeInTheDocument();
      expect(screen.getAllByText("Full access")).toHaveLength(3);
    });

    it("names the source under each table with access inside an open fold, and none under a blocked one", async () => {
      const fromSupport = {
        value: "unrestricted",
        groups: [createGroupValue("Support", "unrestricted", true)],
      };
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                createTable({
                  "table-id": 1,
                  name: "Orders",
                  "view-data": fromSupport,
                }),
                createTable({
                  "table-id": 2,
                  name: "Products",
                  "view-data": fromSupport,
                }),
                createTable({
                  "table-id": 3,
                  name: "Reviews",
                  "view-data": {
                    value: "blocked",
                    groups: [createGroupValue("All Users", "blocked")],
                  },
                }),
              ],
            },
          }),
        },
      });

      await userEvent.click(
        await screen.findByRole("button", { name: /2 tables/ }),
      );

      expect(
        within(getRow("Orders, Full access")).getByText("from Support"),
      ).toBeInTheDocument();
      expect(
        within(getRow("Products, Full access")).getByText("from Support"),
      ).toBeInTheDocument();
      expect(
        within(getRow("Reviews, Blocked")).queryByText(/^from /),
      ).not.toBeInTheDocument();
    });

    it("says varies by table when the tables differ", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                createTable({ "table-id": 1, name: "Orders" }),
                createTable({
                  "table-id": 2,
                  name: "Products",
                  "create-queries": {
                    value: "no",
                    groups: [createGroupValue("Sales", "no")],
                  },
                }),
              ],
            },
          }),
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Orders, Products, Varies by table",
        }),
      ).toBeInTheDocument();
    });

    it("lists every permission under a fold with its count, and keeps it open after Back", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
            },
          }),
        },
      });

      await userEvent.click(await screen.findByText("All permissions (4)"));
      await userEvent.click(
        screen.getByRole("button", {
          name: "Orders · Create queries, Query builder only",
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(
        screen.getByRole("button", {
          name: "Orders · Create queries, Query builder only",
        }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", {
          name: "Sales reports · Collection access, Curate",
        }),
      ).toBeVisible();
    });
  });

  describe("SQL questions and cards", () => {
    const WARNING = "Row and column security never applies to SQL questions.";
    const orders = createTable({ "table-id": 1, name: "Orders" });
    const people = createTable({
      "table-id": 2,
      name: "People",
      sandboxes: [createSandbox({ "table-id": 2 })],
    });

    function isBefore(first: HTMLElement, second: HTMLElement) {
      return Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    function setupDashboard(
      reasons: PermissionDebugAnswer["reasons"],
    ): ReturnType<typeof setup> {
      return setup({
        item: "dashboard/3",
        answers: {
          "dashboard/query": createAnswer({
            "model-type": "dashboard",
            reasons: { collection: createCollection(), ...reasons },
          }),
        },
      });
    }

    it("says at the bottom of a SQL question's Data card that row and column security never applies", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [orders, people],
              "sql-cards": [createSqlCard()],
            },
          }),
        },
      });

      const warning = await screen.findByText(WARNING);

      expect(isBefore(screen.getByText("Rules set by Sales"), warning)).toBe(
        true,
      );
      expect(
        isBefore(
          screen.getByRole("button", { name: "Orders, Full access" }),
          warning,
        ),
      ).toBe(true);
      expect(
        isBefore(warning, screen.getByText("Exploring this question")),
      ).toBe(true);
      expect(screen.queryByText("Not filtered")).not.toBeInTheDocument();
    });

    it("warns about a rule that another group's full access overrides", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                {
                  ...people,
                  sandboxes: [
                    createSandbox({ "table-id": 2, "enforced?": false }),
                  ],
                },
              ],
              "sql-cards": [createSqlCard()],
            },
          }),
        },
      });

      expect(await screen.findByText(WARNING)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "People, Full access" }),
      ).toBeInTheDocument();
    });

    it.each([
      {
        when: "the person has no row and column security rule",
        tables: [orders],
        sqlCards: [createSqlCard()],
      },
      {
        when: "the person's rule is in another database",
        tables: [orders, { ...people, "db-id": 2 }],
        sqlCards: [createSqlCard()],
      },
      {
        when: "the question is a query builder one",
        tables: [orders, people],
        sqlCards: [],
      },
    ])("has no SQL warning when $when", async ({ tables, sqlCards }) => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables,
              "sql-cards": sqlCards,
            },
          }),
        },
      });

      expect(
        await screen.findByText("Data in this question"),
      ).toBeInTheDocument();
      expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });

    it("folds the SQL cards of a database where the person has a rule into one row above the warning", async () => {
      setupDashboard({
        tables: [
          orders,
          people,
          createTable({ "table-id": 3, "db-id": 2, name: "Invoices" }),
        ],
        "sql-cards": [
          createSqlCard({ "card-id": 1, name: "Revenue by state" }),
          createSqlCard({ "card-id": 2, name: "Monthly signups" }),
          createSqlCard({ "card-id": 3, name: "Open invoices", "db-id": 2 }),
        ],
      });

      const fold = await screen.findByRole("button", { name: /2 SQL cards/ });

      expect(fold).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("Not filtered")).toBeInTheDocument();
      expect(screen.queryByText("Revenue by state")).not.toBeInTheDocument();
      expect(
        isBefore(screen.getByRole("button", { name: /2 tables/ }), fold),
      ).toBe(true);
      expect(isBefore(fold, screen.getByText(WARNING))).toBe(true);

      await userEvent.click(fold);

      const first = screen.getByText("Revenue by state");
      const second = screen.getByText("Monthly signups");
      expect(isBefore(first, second)).toBe(true);
      expect(isBefore(second, screen.getByText(WARNING))).toBe(true);
      expect(screen.queryByText("Open invoices")).not.toBeInTheDocument();
    });

    it("gives a dashboard's only SQL card its own row by name, with no fold", async () => {
      setupDashboard({
        tables: [orders, people],
        "sql-cards": [createSqlCard({ name: "Revenue by state" })],
      });

      const name = await screen.findByText("Revenue by state");

      expect(screen.getByText("Not filtered")).toBeInTheDocument();
      expect(isBefore(name, screen.getByText(WARNING))).toBe(true);
      expect(
        screen.queryByRole("button", { name: /SQL card/ }),
      ).not.toBeInTheDocument();
    });

    it("lists no SQL card on a dashboard when the person has no rule in their databases", async () => {
      setupDashboard({
        tables: [orders],
        "sql-cards": [createSqlCard({ name: "Revenue by state" })],
      });

      expect(
        await screen.findByText("Data in this dashboard"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Revenue by state")).not.toBeInTheDocument();
      expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    });
  });

  describe("a name that is cut off", () => {
    const tables = [
      createTable({ "table-id": 1, name: "Orders" }),
      createTable({
        "table-id": 2,
        name: "Products",
        sandboxes: [createSandbox({ "table-id": 2 })],
      }),
    ];

    async function setupDataCard() {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: { collection: createCollection(), tables },
          }),
        },
      });
      await screen.findByRole("button", { name: "Orders, Full access" });
    }

    describe("when it doesn't fit", () => {
      beforeEach(() => {
        mockTextOverflow();
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it.each(["Orders", "· Sample Database"])(
        "shows the table's and the database's name in a tooltip over %s",
        async (text) => {
          await setupDataCard();

          await userEvent.hover(
            within(getRow("Orders, Full access")).getByText(text),
          );

          expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Orders · Sample Database",
          );
        },
      );

      it("shows the same tooltip on a row that opens", async () => {
        await setupDataCard();

        await userEvent.hover(
          within(getRow("Products, Rows filtered")).getByText("Products"),
        );

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "Products · Sample Database",
        );
      });

      it("shows the line under a name in full", async () => {
        await setupDataCard();

        await userEvent.hover(
          within(getRow("Orders, Full access")).getByText("from Sales"),
        );

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "from Sales",
        );
      });

      it("names each table with its database on the Exploring row", async () => {
        await setupDataCard();

        await userEvent.hover(screen.getByText("Orders, Products"));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "Orders · Sample Database, Products · Sample Database",
        );
      });

      it("shows a SQL card's name in full", async () => {
        setup({
          item: "dashboard/3",
          answers: {
            "dashboard/query": createAnswer({
              "model-type": "dashboard",
              reasons: {
                collection: createCollection(),
                tables,
                "sql-cards": [createSqlCard({ name: "Revenue by state" })],
              },
            }),
          },
        });

        await userEvent.hover(await screen.findByText("Revenue by state"));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "Revenue by state",
        );
      });

      it("adds the database's name to a permission row", async () => {
        await setupDataCard();
        await userEvent.click(screen.getByText("All permissions (7)"));

        await userEvent.hover(screen.getByText("Orders · View data"));

        // The fold's own tooltip is still closing, so ask for this one's text
        expect(
          await screen.findByText("Orders · View data · Sample Database"),
        ).toBeInTheDocument();
      });

      it("shows the summary's heading in full", async () => {
        await setupDataCard();
        await userEvent.click(
          screen.getByRole("button", {
            name: /See everything Sandy Sales can access/,
          }),
        );

        await userEvent.hover(
          screen.getByText("Everything Sandy Sales can access"),
        );

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
          "Everything Sandy Sales can access",
        );
      });
    });

    it("gives a table whose names fit no tooltip", async () => {
      await setupDataCard();
      const row = getRow("Orders, Full access");

      await userEvent.hover(within(row).getByText("Orders"));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(
        screen.queryByTitle("Orders · Sample Database"),
      ).not.toBeInTheDocument();
    });

    it("sizes a table's database from the room the name leaves, so the name isn't cut first", async () => {
      await setupDataCard();
      const row = getRow("Orders, Full access");

      // jsdom lays nothing out: a database that shrinks from its own width takes a fraction of a pixel off the name
      expect(within(row).getByText("· Sample Database")).toHaveStyle({
        flex: "1 1 0",
      });
    });
  });

  describe("the reason of a value", () => {
    it("has a Back button with an icon, not the icon's name", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      const back = screen.getByRole("button", { name: "Back" });
      expect(within(back).queryByText("chevronleft")).not.toBeInTheDocument();
      expect(within(back).getByRole("img")).toBeInTheDocument();
      expect(screen.getByText("Explain access")).toBeInTheDocument();
    });

    it("goes back to the item's sheet", async () => {
      setup();
      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(
        screen.getByText("Sandy Sales can see this question."),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Back" }),
      ).not.toBeInTheDocument();
    });

    it("says a table's create queries value in words", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
            },
          }),
        },
      });

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Orders, Query builder only",
        }),
      );

      expect(
        screen.getByText(
          "Sandy Sales can explore Orders with the query builder, but not with native queries, from Sales.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("a collection", () => {
    function setupCollection(collection = createCollection(), target = SANDY) {
      return setup({
        item: "collection/5",
        target,
        answers: {
          "collection/read": createAnswer({
            "model-type": "collection",
            reasons: { collection },
          }),
        },
      });
    }

    it.each([
      ["curate", "Sandy Sales can curate this collection.", "Curate"],
      ["view", "Sandy Sales can view this collection.", "View"],
      ["none", "Sandy Sales can't open this collection.", "No access"],
    ] as const)(
      "says a person with %s access to it in one line, with the status that opens the reason",
      async (value, sentence, status) => {
        setupCollection(createCollection({ value }));

        expect(await screen.findByText(sentence)).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: `Sales reports, ${status}` }),
        ).toBeInTheDocument();
        expect(
          screen.queryByText("Opening this collection"),
        ).not.toBeInTheDocument();
      },
    );

    it("names a personal collection as the person's, and a group's as theirs", async () => {
      const personal = createCollection({ "personal?": true });
      setupCollection(personal);

      expect(
        await screen.findByText("Sandy Sales's personal collection"),
      ).toBeInTheDocument();
    });

    it("calls a personal collection of a group preview theirs", async () => {
      setupCollection(createCollection({ "personal?": true }), SALES_GROUP);

      expect(
        await screen.findByText("Their personal collection"),
      ).toBeInTheDocument();
    });

    it("names the group the access comes from under the verdict", async () => {
      setupCollection(createCollection({ value: "view" }));

      expect(
        await screen.findByText("Sandy Sales can view this collection."),
      ).toBeInTheDocument();
      expect(screen.getByText("from Sales")).toBeInTheDocument();
    });

    it("explains the value when its status is opened", async () => {
      setupCollection();

      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      expect(
        screen.getByText(
          "Sandy Sales has Curate access to the Sales reports collection, from Sales.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("all collections", () => {
    const access = createAccess({
      collections: [
        {
          ...createCollection({ "collection-id": 5, name: "Examples" }),
          location: "/",
          namespace: null,
        },
        {
          ...createCollection({
            "collection-id": 6,
            name: "Sales reports",
            value: "view",
          }),
          location: "/",
          namespace: null,
        },
        {
          ...createCollection({
            "collection-id": 7,
            name: "Secret",
            value: "none",
          }),
          location: "/",
          namespace: null,
        },
        {
          ...createCollection({ "collection-id": 8, name: "Inside Examples" }),
          location: "/5/",
          namespace: null,
        },
        {
          ...createCollection({
            "collection-id": 10,
            name: "Inside Secret",
          }),
          location: "/7/",
          namespace: null,
        },
        {
          ...createCollection({
            "collection-id": 9,
            name: "Sandy's collection",
            "personal?": true,
            "by-rule": true,
            groups: [],
          }),
          location: "/",
          namespace: null,
        },
      ],
    });

    it("lists the collections the person can open, each with its status, their own last", async () => {
      setup({ item: "collection/all", access });

      expect(
        await screen.findByRole("button", { name: "Examples, Curate" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sales reports, View" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Sandy Sales's personal collection, Curate",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Secret")).not.toBeInTheDocument();
      expect(screen.queryByText("Inside Examples")).not.toBeInTheDocument();
      expect(screen.getByText("All collections")).toBeInTheDocument();
    });

    it("lists a collection whose parents the person can't open, as the frame does", async () => {
      setup({ item: "collection/all", access });

      expect(
        await screen.findByRole("button", { name: "Inside Secret, Curate" }),
      ).toBeInTheDocument();
    });

    it("lists each namespace's root, which has no id", async () => {
      const root = { "collection-id": null, value: "view" } as const;
      setup({
        item: "collection/all",
        access: createAccess({
          collections: [
            {
              ...createCollection({ ...root, name: "Our analytics" }),
              location: "/",
              namespace: null,
            },
            {
              ...createCollection({ ...root, name: "Shared collections" }),
              location: "/",
              namespace: "shared-tenant-collection",
            },
          ],
        }),
      });

      expect(
        await screen.findByRole("button", { name: "Our analytics, View" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Shared collections, View" }),
      ).toBeInTheDocument();
    });

    it("calls the personal collection of a group preview theirs", async () => {
      setup({ item: "collection/all", access, target: SALES_GROUP });

      expect(
        await screen.findByRole("button", {
          name: "Their personal collection, Curate",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("see everything", () => {
    const filtered = createTable({
      "table-id": 1,
      name: "Orders",
      sandboxes: [createSandbox({ "table-id": 1 })],
    });
    const blockedView = {
      value: "blocked",
      groups: [createGroupValue("All Users", "blocked")],
    };
    const access = createAccess({
      collections: [
        {
          ...createCollection({
            "collection-id": 7,
            name: "Secret",
            value: "none",
          }),
          location: "/",
          namespace: null,
        },
        {
          ...createCollection({ "collection-id": 5 }),
          location: "/",
          namespace: null,
        },
      ],
      reasons: {
        tables: [
          filtered,
          createTable({
            "table-id": 2,
            name: "Reviews",
            "view-data": blockedView,
          }),
          createTable({
            "table-id": 3,
            name: "People",
            "view-data": blockedView,
          }),
          createTable({ "table-id": 4, name: "Products" }),
        ],
      },
    });

    async function openSummary() {
      setup({ access });
      await userEvent.click(
        await screen.findByRole("button", {
          name: /See everything Sandy Sales can access/,
        }),
      );
    }

    it("counts what the person can open and view, with its sections folded and their counts", async () => {
      await openSummary();

      expect(
        await screen.findByText(
          "Sandy Sales can open 1 collection and view 2 tables.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Everything Sandy Sales can access"),
      ).toBeInTheDocument();
      expect(screen.getByText("Collections (2)")).toBeInTheDocument();
      expect(screen.getByText("1 Curate · 1 No access")).toBeInTheDocument();
      expect(screen.getByText("Tables (4)")).toBeInTheDocument();
      expect(
        screen.getByText("1 Rows filtered · 2 Blocked · 1 Can view"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    });

    it("lists the collections the person can open first when the section opens", async () => {
      await openSummary();

      await userEvent.click(await screen.findByText("Collections (2)"));

      const names = screen
        .getAllByRole("button", { name: /, (Curate|No access)$/ })
        .map((button) => button.getAttribute("aria-label"));
      expect(names).toEqual(["Sales reports, Curate", "Secret, No access"]);
    });

    it("folds tables of one status into a row, and opens a filtered table to its rule", async () => {
      await openSummary();

      await userEvent.click(await screen.findByText("Tables (4)"));

      expect(screen.getByText("2 tables")).toBeInTheDocument();
      expect(screen.getByText("Blocked")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Orders, Rows filtered" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Rules set by Sales")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Products, Can view" }),
      ).toBeInTheDocument();
    });

    it("names the source under a table with access, and none under a collection", async () => {
      await openSummary();

      await userEvent.click(await screen.findByText("Collections (2)"));
      await userEvent.click(screen.getByText("Tables (4)"));

      expect(
        within(getRow("Products, Can view")).getByText("from Sales"),
      ).toBeInTheDocument();
      expect(
        within(getRow("Sales reports, Curate")).queryByText("from Sales"),
      ).not.toBeInTheDocument();
    });

    it("opens a table's reason from the summary and comes back to it", async () => {
      await openSummary();
      await userEvent.click(await screen.findByText("Tables (4)"));

      await userEvent.click(
        screen.getByRole("button", { name: "Orders, Rows filtered" }),
      );

      expect(
        screen.getByText(
          "Sandy Sales sees only the Orders rows that match the user attributes below.",
        ),
      ).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(
        screen.getByText("Everything Sandy Sales can access"),
      ).toBeVisible();
    });
  });

  describe("moving from one item to another", () => {
    const withTables: Answers = {
      "card/query": createAnswer({
        reasons: { collection: createCollection(), tables: [createTable()] },
      }),
    };

    it("shows a collection's own answer after a question, with no Download row", async () => {
      const { showItem } = setup({ answers: withTables });
      expect(await screen.findByText("Download")).toBeInTheDocument();

      showItem("collection/5");

      expect(
        await screen.findByText("Sandy Sales can curate this collection."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Sandy Sales can see this question."),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Download")).not.toBeInTheDocument();
      expect(screen.getByText("Sales reports")).toBeInTheDocument();
    });

    it("gives a dashboard no Download row after a question", async () => {
      const { showItem } = setup({ answers: withTables });
      expect(await screen.findByText("Download")).toBeInTheDocument();

      showItem("dashboard/3");

      expect(await screen.findByText("Sales overview")).toBeInTheDocument();
      expect(
        await screen.findByText("Sandy Sales can see this dashboard."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Download")).not.toBeInTheDocument();
    });

    it("drops the previous question's name and answers for a question that is missing", async () => {
      fetchMock.get("path:/api/card/99", 404);
      fetchMock.get({
        url: "path:/api/ee/permission_debug",
        query: { model_id: "99" },
        response: 404,
      });
      const { showItem } = setup();
      expect(await screen.findByText("Orders by state")).toBeInTheDocument();

      showItem("question/99");

      expect(
        await screen.findByText("Couldn't explain this access."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Orders by state")).not.toBeInTheDocument();
    });

    it("closes the reason of a value when another item is shown", async () => {
      const { showItem } = setup({ answers: withTables });
      await userEvent.click(
        await screen.findByRole("button", { name: "Sales reports, Curate" }),
      );

      showItem("dashboard/3");

      expect(
        await screen.findByText("Sandy Sales can see this dashboard."),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Back" }),
      ).not.toBeInTheDocument();
    });
  });
});
