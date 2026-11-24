import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
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

type Answers = Partial<Record<PermissionDebugAction, PermissionDebugAnswer>>;

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

    it("says what editing needs", async () => {
      setup();

      expect(
        await screen.findByText("Editing this question"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/also need Curate access to its collection\./),
      ).toBeInTheDocument();
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

    it("says the person can't open the question and why, with the collection's status", async () => {
      setup({ answers: { "card/read": denied, "card/query": denied } });

      expect(
        await screen.findByText("Sandy Sales can't open this question."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Sandy Sales has no access to its collection, Sales reports.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sales reports, No access" }),
      ).toBeInTheDocument();
    });

    it("leaves out what the data would say about a question the person can't open", async () => {
      setup({ answers: { "card/read": denied, "card/query": denied } });

      await screen.findByText("Sandy Sales can't open this question.");

      expect(
        screen.queryByText("Data in this question"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Exploring this question"),
      ).not.toBeInTheDocument();
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

  describe("limited", () => {
    it("shows the download verdict and each table's level", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [
                createTable({
                  "download-results": {
                    value: "ten-thousand-rows",
                    groups: [
                      createGroupValue("Sales", "ten-thousand-rows", true),
                    ],
                  },
                }),
              ],
            },
          }),
          "card/download-data": createAnswer({
            decision: "limited",
            outcome: "limited",
            reasons: {},
          }),
        },
      });

      expect(
        await screen.findByText(
          "Their downloads are capped below the full result.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Orders, Up to 10,000 rows" }),
      ).toBeInTheDocument();
    });

    it("says when the person can't download", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection(),
              tables: [createTable()],
            },
          }),
          "card/download-data": createAnswer({
            decision: "denied",
            outcome: "denied",
            reasons: {},
          }),
        },
      });

      expect(
        await screen.findByText("They can't download these results."),
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

    it("folds two tables with full access into one row that opens", async () => {
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
      expect(fold).toBeInTheDocument();
      expect(screen.getAllByText("Full access")).toHaveLength(3);
      expect(
        screen.getByRole("button", { name: "Orders, Full access" }),
      ).toBeInTheDocument();

      await userEvent.click(fold);

      expect(
        screen.queryByRole("button", { name: "Orders, Full access" }),
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
        },
        {
          ...createCollection({
            "collection-id": 6,
            name: "Sales reports",
            value: "view",
          }),
          location: "/",
        },
        {
          ...createCollection({
            "collection-id": 7,
            name: "Secret",
            value: "none",
          }),
          location: "/",
        },
        {
          ...createCollection({ "collection-id": 8, name: "Inside Examples" }),
          location: "/5/",
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
        },
        { ...createCollection({ "collection-id": 5 }), location: "/" },
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

    it("shows a collection's own answer after a question, with no download sentence", async () => {
      const { showItem } = setup({ answers: withTables });
      expect(
        await screen.findByText("They can download the full result."),
      ).toBeInTheDocument();

      showItem("collection/5");

      expect(
        await screen.findByText("Sandy Sales can curate this collection."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Sandy Sales can see this question."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("They can download the full result."),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Sales reports")).toBeInTheDocument();
    });

    it("gives a dashboard no download sentence after a question", async () => {
      const { showItem } = setup({ answers: withTables });
      expect(
        await screen.findByText("They can download the full result."),
      ).toBeInTheDocument();

      showItem("dashboard/3");

      expect(await screen.findByText("Sales overview")).toBeInTheDocument();
      expect(
        await screen.findByText("Sandy Sales can see this dashboard."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("They can download the full result."),
      ).not.toBeInTheDocument();
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
