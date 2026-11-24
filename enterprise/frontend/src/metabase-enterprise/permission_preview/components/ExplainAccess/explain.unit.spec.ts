import { createMockUser } from "metabase-types/api/mocks";

import type { PreviewTarget } from "../types";

import {
  getConflictSentence,
  getSubject,
  getTableStatus,
  getVerdict,
  groupTablesByValue,
} from "./explain";
import { createAnswer, createSandbox, createTable } from "./fixtures";

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
  const readDenied = createAnswer({ decision: "denied", outcome: "denied" });

  it("is an error when the person can't open the item", () => {
    expect(getVerdict("question", "Sandy Sales", { read: readDenied })).toEqual(
      { tone: "error", text: "Sandy Sales can't open this question." },
    );
  });

  it("is a warning when the person can open the question but not see its results", () => {
    expect(
      getVerdict("question", "Sandy Sales", {
        read: createAnswer(),
        query: createAnswer({ decision: "denied", outcome: "denied" }),
      }),
    ).toEqual({
      tone: "warning",
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
      tone: "warning",
      text: "Sandy Sales can open this dashboard but can't see 1 of its 3 cards.",
    });
  });

  it("says queries fail when a policy can't run", () => {
    expect(
      getVerdict("question", "a member of Sales", {
        read: createAnswer(),
        query: createAnswer({ outcome: "broken" }),
      }),
    ).toEqual({ tone: "error", text: "Queries fail for a member of Sales." });
  });

  it("starts a group's sentence with a capital", () => {
    expect(
      getVerdict("question", "a member of Sales", {
        read: createAnswer(),
        query: createAnswer(),
      }).text,
    ).toBe("A member of Sales can see this question.");
  });

  it("is a success for a collection the person can open", () => {
    expect(
      getVerdict("collection", "Sandy Sales", { read: createAnswer() }),
    ).toEqual({
      tone: "success",
      text: "Sandy Sales can open this collection.",
    });
  });
});

describe("getTableStatus", () => {
  it("is blocked when View data is blocked", () => {
    const table = createTable({
      "view-data": { value: "blocked", groups: [] },
    });

    expect(getTableStatus(table, createAnswer())).toBe("blocked");
  });

  it("is filtered for an enforced row and column security rule", () => {
    const table = createTable({ sandboxes: [createSandbox()] });

    expect(getTableStatus(table, createAnswer())).toBe("filtered");
  });

  it("is can view when the rule of the person's other group overrides it", () => {
    const table = createTable({
      sandboxes: [createSandbox({ "enforced?": false })],
    });

    expect(getTableStatus(table, createAnswer())).toBe("can-view");
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

    expect(getTableStatus(createTable(), answer)).toBe("filtered");
  });

  it("is can't load when a problem names it", () => {
    const answer = createAnswer({
      reasons: {
        problems: [
          { type: "missing-attribute", attribute: "category", "table-id": 1 },
        ],
      },
    });

    expect(getTableStatus(createTable(), answer)).toBe("cant-load");
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

describe("getConflictSentence", () => {
  it("explains two groups' row and column security on one table", () => {
    const table = createTable({
      sandboxes: [
        createSandbox({ "sandbox-id": 1, "group-name": "Sales" }),
        createSandbox({ "sandbox-id": 2, "group-name": "Support" }),
      ],
    });

    expect(
      getConflictSentence(
        { type: "conflicting-sandboxes", "table-id": 1, "group-ids": [9, 10] },
        createAnswer({ reasons: { tables: [table] } }),
      ),
    ).toBe(
      "Orders: the row and column security of two groups (Sales, Support) both apply, so queries fail.",
    );
  });

  it("explains row and column security with connection impersonation on one database", () => {
    expect(
      getConflictSentence(
        { type: "sandbox-and-impersonation", "db-id": 1 },
        createAnswer({ reasons: { tables: [createTable()] } }),
      ),
    ).toBe(
      "Sample Database: row and column security and connection impersonation both apply, so queries fail.",
    );
  });
});
