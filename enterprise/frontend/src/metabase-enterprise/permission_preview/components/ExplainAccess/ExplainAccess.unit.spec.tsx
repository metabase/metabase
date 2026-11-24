import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type {
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
}

function setup({
  item = "question/12",
  target = SANDY,
  answers = {},
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
  renderWithProviders(
    <ExplainAccess target={target} userId={2} item={item} onClose={onClose} />,
  );
  return { onClose };
}

describe("ExplainAccess", () => {
  it("asks for an item when the frame shows all collections", () => {
    setup({ item: "collection/all" });

    expect(
      screen.getByText(
        "Open a question, a dashboard or a collection to see why they can or can't open it.",
      ),
    ).toBeInTheDocument();
  });

  it("names the item and the person in the header, and closes", async () => {
    const { onClose } = setup();

    expect(
      await screen.findByText("Access to “Orders by state”"),
    ).toBeInTheDocument();
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
        screen.getByRole("button", {
          name: "Sales reports, Curate · from Sales",
        }),
      ).toBeInTheDocument();
    });

    it("says a collection is curated by rule when no group gives the access", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            reasons: {
              collection: createCollection({
                name: "Their personal collection",
                "by-rule": true,
                groups: [createGroupValue("All Users", "none")],
              }),
            },
          }),
          "card/read": createAnswer({
            reasons: {
              collection: createCollection({
                name: "Their personal collection",
                "by-rule": true,
                groups: [createGroupValue("All Users", "none")],
              }),
            },
          }),
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Their personal collection, Curate · by rule",
        }),
      ).toBeInTheDocument();
    });

    it("lists each group's access to the collection when the row is opened", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Sales reports, Curate · from Sales",
        }),
      );

      expect(
        screen.getByText("Sales reports · Collection access"),
      ).toBeInTheDocument();
      expect(screen.getByText("Applies")).toBeInTheDocument();
      expect(screen.getByText("No access")).toBeInTheDocument();
      expect(
        screen.getByText("The most permissive group applies."),
      ).toBeInTheDocument();
    });

    it("says what editing needs", async () => {
      setup();

      expect(
        await screen.findByText("Editing this question"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/access to its collection\./),
      ).toBeInTheDocument();
    });
  });

  describe("denied", () => {
    it("says the person can't open the question, with its collection as the reason", async () => {
      const collection = createCollection({
        value: "none",
        groups: [createGroupValue("All Users", "none")],
      });
      setup({
        answers: {
          "card/read": createAnswer({
            decision: "denied",
            outcome: "denied",
            reasons: { collection },
          }),
          "card/query": createAnswer({
            decision: "denied",
            outcome: "denied",
            reasons: { collection },
          }),
        },
      });

      expect(
        await screen.findByText("Sandy Sales can't open this question."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sales reports, No access" }),
      ).toBeInTheDocument();
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
        screen.getByRole("button", { name: "Orders, ✕ Blocked" }),
      );

      expect(screen.getByText("Orders · View data")).toBeInTheDocument();
      expect(
        screen.getByText("Blocked in every group Sandy Sales is in."),
      ).toBeInTheDocument();
      expect(screen.getByText("All Users")).toBeInTheDocument();
      expect(screen.getByText("Data Analysts")).toBeInTheDocument();
      expect(screen.queryByText("Applies")).not.toBeInTheDocument();
    });

    it("counts the cards of a dashboard that can't load", async () => {
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
            data: { "cards-total": 3, "cards-blocked": 1 },
            reasons: {
              collection: createCollection(),
              tables: [blocked, createTable({ "table-id": 2, name: "Orders" })],
            },
          }),
        },
      });

      expect(
        await screen.findByText(
          "Sandy Sales can open this dashboard but can't see 1 of its 3 cards.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reviews, ✕ Blocked" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Data in this dashboard")).toBeInTheDocument();
    });
  });

  describe("reshaped", () => {
    const filtered = createTable({
      name: "Products",
      sandboxes: [createSandbox({ "table-id": 1 })],
    });

    it("shows each filter as attribute, value and column, with the group that set it", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "reshaped",
            segment: ["sandboxed"],
            reasons: { collection: createCollection(), tables: [filtered] },
          }),
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Products, ◐ Rows filtered",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("category Gizmo")).toBeInTheDocument();
      expect(screen.getByText("→ Products.Category")).toBeInTheDocument();
      expect(screen.getByText("Rules set by Sales")).toBeInTheDocument();
    });

    it("shows the rule and the groups when the row is opened", async () => {
      setup({
        answers: {
          "card/query": createAnswer({
            outcome: "reshaped",
            segment: ["sandboxed"],
            reasons: { collection: createCollection(), tables: [filtered] },
          }),
        },
      });

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Products, ◐ Rows filtered",
        }),
      );

      expect(
        screen.getByText(
          "Sandy Sales sees only the Products rows that match the attributes below, from Sales.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Row and column security")).toBeInTheDocument();
      expect(screen.getByText("Set by Sales")).toBeInTheDocument();
      expect(screen.getByText("Columns: all columns")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getByText("Rows filtered")).toBeInTheDocument();
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
    it("says queries fail for a group and names the missing attribute on the table", async () => {
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
        screen.getByRole("button", { name: "Products, ⚠ Can't load" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "No value for state. Set a value for state to see this table.",
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
          "Orders: the row and column security of two groups (Sales, Support) both apply, so queries fail.",
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
          name: "Orders, Products, Query builder only · from Sales",
        }),
      ).toBeInTheDocument();
    });

    it("lists every permission in a fold with its count", async () => {
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
          name: /All permissions on this question \(4\)/,
        }),
      );

      expect(
        screen.getByRole("button", {
          name: "Orders · Create queries, Query builder only",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Sales reports · Collection access, Curate",
        }),
      ).toBeInTheDocument();
    });
  });

  it("lists a collection's access per group", async () => {
    setup({
      item: "collection/5",
      answers: {
        "collection/read": createAnswer({
          "model-type": "collection",
          reasons: { collection: createCollection() },
        }),
      },
    });

    expect(
      await screen.findByText("Sandy Sales can open this collection."),
    ).toBeInTheDocument();
    expect(screen.getByText("Collection access")).toBeInTheDocument();
  });
});
