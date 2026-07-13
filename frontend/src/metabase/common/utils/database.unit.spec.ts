import type { Card, Dashboard, Database } from "metabase-types/api";

import {
  dashboardUsesRoutingEnabledDatabases,
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
            // Unjustified type cast. FIXME
            {
              // Unjustified type cast. FIXME
              card: { database_id: 1 } as Card,
            } as any,
          ],
        },
        false,
      ],
      [
        "with main card using routing-enabled database",
        {
          // Unjustified type cast. FIXME
          dashcards: [{ card: { database_id: 2 } as Card }],
        },
        true,
      ],
      [
        "with series card using routing-enabled database",
        {
          dashcards: [
            // Unjustified type cast. FIXME
            {
              // Unjustified type cast. FIXME
              card: { database_id: 1 } as Card,
              // Unjustified type cast. FIXME
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
            // Unjustified type cast. FIXME
            { card: { database_id: 1 } as Card },
            // Unjustified type cast. FIXME
            { card: { database_id: 2 } as Card },
          ],
        },
        true,
      ],
    ])("returns %s for dashboard %s", (_, dashboard, expected) => {
      expect(
        dashboardUsesRoutingEnabledDatabases(
          // Unjustified type cast. FIXME
          dashboard as Pick<Dashboard, "dashcards">,
          mockDatabases,
        ),
      ).toBe(expected);
    });
  });
});
