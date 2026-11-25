import { createMockUser } from "metabase-types/api/mocks";

import type { PreviewTarget } from "../types";

import {
  getCollectionName,
  getSubject,
  getTableProblemNotes,
  getTableStatus,
  getVerdict,
  groupTablesByValue,
} from "./explain";
import {
  createAnswer,
  createCollection,
  createSandbox,
  createTable,
} from "./fixtures";

const SANDY: PreviewTarget = {
  kind: "user",
  user: createMockUser({ common_name: "Sandy Sales" }),
};

describe("getSubject", () => {
  it("names a user", () => {
    expect(getSubject(SANDY)).toBe("Sandy Sales");
  });

  it("says a member of the group for a group", () => {
    expect(
      getSubject({
        kind: "group",
        group: { id: 9, name: "Sales", magic_group_type: null },
      }),
    ).toBe("a member of Sales");
  });
});

describe("getVerdict", () => {
  const readDenied = createAnswer({
    decision: "denied",
    outcome: "denied",
    reasons: { collection: createCollection() },
  });

  it("is an error with no reason when the person can't open the item", () => {
    expect(getVerdict("question", "Sandy Sales", { read: readDenied })).toEqual(
      {
        kind: "error",
        text: "Sandy Sales can't open this question.",
      },
    );
  });

  it("is a warning when the person can open the question but not see its results", () => {
    expect(
      getVerdict("question", "Sandy Sales", {
        read: createAnswer(),
        query: createAnswer({ decision: "denied", outcome: "denied" }),
      }),
    ).toEqual({
      kind: "warning",
      text: "Sandy Sales can open this question but can't see its results.",
    });
  });

  it("counts the cards a person can't see on a dashboard", () => {
    expect(
      getVerdict("dashboard", "Sandy Sales", {
        read: createAnswer({ "model-type": "dashboard" }),
        query: createAnswer({
          "model-type": "dashboard",
          decision: "limited",
          outcome: "limited",
          data: { "cards-total": 3, "cards-blocked": 1 },
        }),
      }),
    ).toEqual({
      kind: "warning",
      text: "Sandy Sales can open this dashboard but can't see 1 of its 3 cards.",
    });
  });

  it("says queries fail when a policy can't run", () => {
    expect(
      getVerdict("question", "a member of Sales", {
        read: createAnswer(),
        query: createAnswer({ outcome: "broken" }),
      }),
    ).toEqual({ kind: "warning", text: "Queries fail for a member of Sales." });
  });

  it("starts a group's sentence with a capital", () => {
    expect(
      getVerdict("question", "a member of Sales", {
        read: createAnswer(),
        query: createAnswer(),
      }).text,
    ).toBe("A member of Sales can see this question.");
  });

  it("is filtered, with the limited icon, for a question whose rows are reshaped", () => {
    expect(
      getVerdict("question", "Sandy Sales", {
        read: createAnswer(),
        query: createAnswer({ outcome: "reshaped" }),
      }),
    ).toEqual({ kind: "filtered", text: "Sandy Sales can see this question." });
  });

  it("says card for a dashboard of one card, cards for more", () => {
    const withTotal = (total: number) =>
      getVerdict("dashboard", "Sandy Sales", {
        read: createAnswer({ "model-type": "dashboard" }),
        query: createAnswer({
          "model-type": "dashboard",
          decision: "limited",
          outcome: "limited",
          data: { "cards-total": total, "cards-blocked": 1 },
        }),
      }).text;

    expect(withTotal(1)).toBe(
      "Sandy Sales can open this dashboard but can't see 1 of its 1 card.",
    );
    expect(withTotal(2)).toBe(
      "Sandy Sales can open this dashboard but can't see 1 of its 2 cards.",
    );
  });
});

describe("getTableStatus", () => {
  it("is blocked when View data is blocked", () => {
    const table = createTable({
      "view-data": { value: "blocked", groups: [] },
    });

    expect(getTableStatus(table, {})).toBe("blocked");
  });

  it("is filtered for an enforced row and column security rule", () => {
    const table = createTable({ sandboxes: [createSandbox()] });

    expect(getTableStatus(table, {})).toBe("filtered");
  });

  it("is can view when the rule of the person's other group overrides it", () => {
    const table = createTable({
      sandboxes: [createSandbox({ "enforced?": false })],
    });

    expect(getTableStatus(table, {})).toBe("can-view");
  });

  it("is filtered for an enforced connection impersonation on its database", () => {
    const answer = createAnswer({
      reasons: {
        impersonations: [
          {
            "db-id": 1,
            "db-name": "Sample Database",
            "group-id": 9,
            "group-name": "Sales",
            attribute: "role",
            value: "analyst",
            "missing?": false,
            "enforced?": true,
          },
        ],
      },
    });

    expect(getTableStatus(createTable(), answer.reasons)).toBe("filtered");
  });

  it("is can't load when a problem names it", () => {
    const answer = createAnswer({
      reasons: {
        problems: [
          { type: "missing-attribute", attribute: "category", "table-id": 1 },
        ],
      },
    });

    expect(getTableStatus(createTable(), answer.reasons)).toBe("cant-load");
  });
});

describe("groupTablesByValue", () => {
  it("folds the tables with the same value into one", () => {
    const orders = createTable({ "table-id": 1, name: "Orders" });
    const products = createTable({ "table-id": 2, name: "Products" });
    const people = createTable({
      "table-id": 3,
      name: "People",
      "create-queries": { value: "no", groups: [] },
    });

    expect(
      groupTablesByValue(
        [orders, products, people],
        (table) => table["create-queries"].value,
      ).map(({ value, tables }) => [value, tables.map((table) => table.name)]),
    ).toEqual([
      ["query-builder", ["Orders", "Products"]],
      ["no", ["People"]],
    ]);
  });
});

describe("getCollectionName", () => {
  const personal = { name: "Sandy's Personal Collection", "personal?": true };

  it("keeps the name of a collection that isn't personal", () => {
    expect(
      getCollectionName({ name: "Sales reports", "personal?": false }, SANDY),
    ).toBe("Sales reports");
  });

  it("calls a personal collection the person's", () => {
    expect(getCollectionName(personal, SANDY)).toBe(
      "Sandy Sales's personal collection",
    );
  });

  it("calls a personal collection of a group preview theirs", () => {
    expect(
      getCollectionName(personal, {
        kind: "group",
        group: { id: 9, name: "Sales", magic_group_type: null },
      }),
    ).toBe("Their personal collection");
  });
});

describe("getTableProblemNotes", () => {
  it("explains two groups' row and column security on one table, with the fix", () => {
    const table = createTable({
      sandboxes: [
        createSandbox({ "sandbox-id": 1, "group-name": "Sales" }),
        createSandbox({ "sandbox-id": 2, "group-name": "Support" }),
      ],
    });

    expect(getTableProblemNotes(table, {}, SANDY)).toEqual([
      "Sales and Support both set row and column security on Orders. Keep one policy, or give one of the groups Can view on Orders.",
    ]);
  });

  it("lists three groups with all", () => {
    const table = createTable({
      sandboxes: [
        createSandbox({ "sandbox-id": 1, "group-name": "Sales" }),
        createSandbox({ "sandbox-id": 2, "group-name": "Support" }),
        createSandbox({ "sandbox-id": 3, "group-name": "Finance" }),
      ],
    });

    expect(getTableProblemNotes(table, {}, SANDY)[0]).toContain(
      "Sales, Support and Finance all set row and column security on Orders.",
    );
  });

  it("explains row and column security with connection impersonation on one database", () => {
    const reasons = {
      impersonations: [
        {
          "db-id": 1,
          "db-name": "Sample Database",
          "group-id": 10,
          "group-name": "Support",
          attribute: "role",
          value: "analyst",
          "missing?": false,
          "enforced?": true,
        },
      ],
    };
    const table = createTable({ sandboxes: [createSandbox()] });

    expect(getTableProblemNotes(table, reasons, SANDY)).toEqual([
      "Row and column security from Sales and connection impersonation from Support both apply on Sample Database. Keep one of the two policies.",
    ]);
  });

  it("names the attributes a user lacks, and where to set them", () => {
    const filter = (attribute: string) => ({
      attribute,
      value: null,
      column: "Orders.Region",
      "missing?": true,
    });
    const table = createTable({
      sandboxes: [
        createSandbox({ filters: [filter("region"), filter("state")] }),
      ],
    });

    expect(getTableProblemNotes(table, {}, SANDY)).toEqual([
      "Sales needs the attributes region and state, which Sandy Sales doesn't have. Set them on Sandy Sales in Admin › People, or in their sign-in provider.",
    ]);
  });

  it("is empty for a table with nothing wrong", () => {
    expect(getTableProblemNotes(createTable(), {}, SANDY)).toEqual([]);
  });
});
