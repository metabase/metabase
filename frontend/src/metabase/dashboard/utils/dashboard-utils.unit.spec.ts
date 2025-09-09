import type { Location } from "history";

import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createMockLocation } from "metabase-types/store/mocks";

import {
  createTabSlug,
  getCurrentTabDashboardCards,
  hasDatabaseActionsEnabled,
  parseTabSlug,
} from "./dashboard-utils";

const ENABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 1,
  settings: { "database-enable-actions": true },
});
const DISABLED_ACTIONS_DATABASE = createMockDatabase({
  id: 2,
  settings: { "database-enable-actions": false },
});
const NO_ACTIONS_DATABASE = createMockDatabase({ id: 3 });

function getMockLocationWithTab(slug: Location["query"][string]) {
  return createMockLocation({ query: { tab: slug } });
}

describe("Dashboard utils", () => {
  describe("hasDatabaseActionsEnabled", () => {
    it("should return true if a database has model actions enabled", () => {
      expect(hasDatabaseActionsEnabled(ENABLED_ACTIONS_DATABASE)).toBe(true);
    });

    it("should return false if a database does not have model actions enabled or is undefined", () => {
      expect(hasDatabaseActionsEnabled(DISABLED_ACTIONS_DATABASE)).toBe(false);
      expect(hasDatabaseActionsEnabled(NO_ACTIONS_DATABASE)).toBe(false);
    });

    it("should return true if any database has actions enabled", () => {
      const databases = [
        ENABLED_ACTIONS_DATABASE,
        DISABLED_ACTIONS_DATABASE,
        NO_ACTIONS_DATABASE,
      ];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(true);
    });

    it("should return false if all databases have actions disabled", () => {
      const databases = [DISABLED_ACTIONS_DATABASE, NO_ACTIONS_DATABASE];

      const result = databases.some(hasDatabaseActionsEnabled);
      expect(result).toBe(false);
    });
  });

  describe("getCurrentTabDashboardCards", () => {
    it("when selectedTabId=null returns cards with dashboard_tab_id=undefined", () => {
      const selectedTabId = null;
      const dashcard = createMockDashboardCard({
        dashboard_tab_id: undefined,
      });
      const dashboard = createMockDashboard({
        dashcards: [dashcard],
      });

      expect(
        getCurrentTabDashboardCards(dashboard, selectedTabId),
      ).toStrictEqual([
        {
          card: dashcard.card,
          dashcard,
        },
      ]);
    });

    it("returns cards from selected tab only", () => {
      const selectedTabId = 1;
      const visibleDashcard = createMockDashboardCard({
        dashboard_tab_id: 1,
      });
      const hiddenDashcard = createMockDashboardCard({
        dashboard_tab_id: 2,
      });

      const dashboard = createMockDashboard({
        dashcards: [visibleDashcard, hiddenDashcard],
      });

      expect(
        getCurrentTabDashboardCards(dashboard, selectedTabId),
      ).toStrictEqual([
        {
          card: visibleDashcard.card,
          dashcard: visibleDashcard,
        },
      ]);
    });
  });

  describe("parseTabSlug", () => {
    it("should return the tab ID from the location object if valid", () => {
      expect(parseTabSlug(getMockLocationWithTab("1-tab-name"))).toBe(1);
    });

    it("should return null if the slug is invalid", () => {
      expect(parseTabSlug(getMockLocationWithTab(null))).toBe(null);
      expect(parseTabSlug(getMockLocationWithTab(undefined))).toBe(null);
      expect(parseTabSlug(getMockLocationWithTab(""))).toBe(null);
      expect(
        parseTabSlug(
          getMockLocationWithTab(["1-tab-name", "2-another-tab-name"]),
        ),
      ).toBe(null);
      expect(parseTabSlug({ ...getMockLocationWithTab(""), query: {} })).toBe(
        null,
      );
    });
  });

  describe("createTabSlug", () => {
    it("should return a lower-cased, hyphenated concatenation of the tabId and name", () => {
      expect(createTabSlug({ id: 1, name: "SoMe-TaB-NaMe" })).toEqual(
        "1-some-tab-name",
      );
    });

    it("should return an empty string when tabId or name is invalid", () => {
      expect(createTabSlug({ id: null, name: "SoMe-TaB-NaMe" })).toEqual("");
      expect(createTabSlug({ id: -1, name: "SoMe-TaB-NaMe" })).toEqual("");

      expect(createTabSlug({ id: 1, name: "" })).toEqual("");
      expect(createTabSlug({ id: 1, name: undefined })).toEqual("");
    });
  });
});
