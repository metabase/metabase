import type { Card, Dashboard, Database } from "metabase-types/api";

import {
  dashboardUsesRoutingEnabledDatabases,
  hasDbRoutingEnabled,
  questionUsesRoutingEnabledDatabase,
} from "./utils";

describe("database routing utility functions", () => {
  const mockDatabases: Pick<Database, "id" | "router_user_attribute">[] = [
    { id: 1, router_user_attribute: null },
    { id: 2, router_user_attribute: "department" },
    { id: 3, router_user_attribute: "team" },
  ];

  describe("hasDbRoutingEnabled", () => {
    it("returns false for database without router_user_attribute", () => {
      expect(hasDbRoutingEnabled({ router_user_attribute: null })).toBe(false);
      expect(hasDbRoutingEnabled({ router_user_attribute: undefined })).toBe(
        false,
      );
    });

    it("returns true for database with router_user_attribute", () => {
      expect(hasDbRoutingEnabled({ router_user_attribute: "department" })).toBe(
        true,
      );
      expect(hasDbRoutingEnabled({ router_user_attribute: "team" })).toBe(true);
    });
  });

  describe("questionUsesRoutingEnabledDatabase", () => {
    it("returns false for question without database_id", () => {
      const question = { database_id: undefined };
      expect(questionUsesRoutingEnabledDatabase(question, mockDatabases)).toBe(
        false,
      );
    });

    it("returns false for question using database without routing", () => {
      const question = { database_id: 1 };
      expect(questionUsesRoutingEnabledDatabase(question, mockDatabases)).toBe(
        false,
      );
    });

    it("returns true for question using database with routing", () => {
      const question = { database_id: 2 };
      expect(questionUsesRoutingEnabledDatabase(question, mockDatabases)).toBe(
        true,
      );
    });

    it("returns false for question using non-existent database", () => {
      const question = { database_id: 999 };
      expect(questionUsesRoutingEnabledDatabase(question, mockDatabases)).toBe(
        false,
      );
    });
  });

  describe("dashboardUsesRoutingEnabledDatabases", () => {
    it("returns false for dashboard without dashcards", () => {
      const dashboard = { dashcards: [] };
      expect(
        dashboardUsesRoutingEnabledDatabases(dashboard, mockDatabases),
      ).toBe(false);
    });

    it("returns false for dashboard with cards using non-routing databases", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 1 } as Card,
            series: [{ database_id: 1 } as Card],
          } as any, // Use any to avoid complex typing for test
        ],
      } as Pick<Dashboard, "dashcards">;

      expect(
        dashboardUsesRoutingEnabledDatabases(dashboard, mockDatabases),
      ).toBe(false);
    });

    it("returns true for dashboard with main card using routing-enabled database", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 2 } as Card,
          },
        ],
      } as Pick<Dashboard, "dashcards">;

      expect(
        dashboardUsesRoutingEnabledDatabases(dashboard, mockDatabases),
      ).toBe(true);
    });

    it("returns true for dashboard with series card using routing-enabled database", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 1 } as Card,
            series: [{ database_id: 2 } as Card],
          } as any, // Use any to avoid complex typing for test
        ],
      } as Pick<Dashboard, "dashcards">;

      expect(
        dashboardUsesRoutingEnabledDatabases(dashboard, mockDatabases),
      ).toBe(true);
    });

    it("returns true for dashboard with mixed cards where some use routing", () => {
      const dashboard = {
        dashcards: [
          {
            card: { database_id: 1 } as Card, // no routing
          },
          {
            card: { database_id: 2 } as Card, // has routing
          },
        ],
      } as Pick<Dashboard, "dashcards">;

      expect(
        dashboardUsesRoutingEnabledDatabases(dashboard, mockDatabases),
      ).toBe(true);
    });
  });
});
