import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, Dashboard, Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import {
  dashboardUsesRoutingEnabledDatabases,
  findDatabaseByName,
  hasDbRoutingEnabled,
  questionUsesRoutingEnabledDatabase,
} from "./database";

describe("database routing utility functions", () => {
  const mockDatabases: Pick<Database, "id" | "router_user_attribute">[] = [
    { id: 1, router_user_attribute: null },
    { id: 2, router_user_attribute: "department" },
    { id: 3, router_user_attribute: "team" },
  ];

  describe("hasDbRoutingEnabled", () => {
    it.each([
      [null, false],
      [undefined, false],
      ["department", true],
      ["team", true],
    ])(
      "returns %s when router_user_attribute is %s",
      (router_user_attribute, expected) => {
        expect(hasDbRoutingEnabled({ router_user_attribute })).toBe(expected);
      },
    );
  });

  describe("questionUsesRoutingEnabledDatabase", () => {
    it.each([
      ["without database_id", { database_id: undefined }, false],
      ["using database without routing", { database_id: 1 }, false],
      ["using database with routing", { database_id: 2 }, true],
      ["using non-existent database", { database_id: 999 }, false],
    ])("returns %s for question %s", (_, question, expected) => {
      expect(questionUsesRoutingEnabledDatabase(question, mockDatabases)).toBe(
        expected,
      );
    });
  });

  describe("dashboardUsesRoutingEnabledDatabases", () => {
    it.each([
      ["without dashcards", { dashcards: [] }, false],
      [
        "with cards using non-routing databases",
        {
          dashcards: [
            {
              card: { database_id: 1 } as Card,
            } as any,
          ],
        },
        false,
      ],
      [
        "with main card using routing-enabled database",
        {
          dashcards: [{ card: { database_id: 2 } as Card }],
        },
        true,
      ],
      [
        "with series card using routing-enabled database",
        {
          dashcards: [
            {
              card: { database_id: 1 } as Card,
              series: [{ database_id: 2 } as Card],
            } as any,
          ],
        },
        true,
      ],
      [
        "with mixed cards where some use routing",
        {
          dashcards: [
            { card: { database_id: 1 } as Card },
            { card: { database_id: 2 } as Card },
          ],
        },
        true,
      ],
    ])("returns %s for dashboard %s", (_, dashboard, expected) => {
      expect(
        dashboardUsesRoutingEnabledDatabases(
          dashboard as Pick<Dashboard, "dashcards">,
          mockDatabases,
        ),
      ).toBe(expected);
    });
  });
});

describe("findDatabaseByName", () => {
  const databases = [
    createMockDatabase({ id: 1, name: "Sample Database" }),
    createMockDatabase({ id: 7, name: "Sales" }),
  ];

  it("finds a database by its exact name", () => {
    expect(findDatabaseByName(databases, "Sales").id).toBe(databases[1].id);
  });

  it("matches case-sensitively", () => {
    expect(findDatabaseByName(databases, "sales")).toBeUndefined();
    expect(findDatabaseByName(databases, "SALES")).toBeUndefined();
  });

  it("returns undefined for an unknown name", () => {
    expect(findDatabaseByName(databases, "Nonexistent")).toBeUndefined();
  });

  it("returns the database with the lowest id on a name collision", () => {
    const collisions = [
      createMockDatabase({ id: 9, name: "Production" }),
      createMockDatabase({ id: 4, name: "Production" }),
      createMockDatabase({ id: 12, name: "Production" }),
    ];

    expect(findDatabaseByName(collisions, "Production").id).toBe(
      collisions[1].id,
    );
  });

  it("never matches the virtual Saved Questions database", () => {
    const virtualDb = createMockDatabase({
      id: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      name: "Saved Questions",
    });

    expect(
      findDatabaseByName([...databases, virtualDb], "Saved Questions"),
    ).toBeUndefined();
  });
});
