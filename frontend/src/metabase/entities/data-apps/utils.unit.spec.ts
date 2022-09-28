import type { DataAppNavItem } from "metabase-types/api";
import {
  createMockDataApp,
  createMockDataAppPage,
} from "metabase-types/api/mocks";
import {
  getDataAppHomePageId,
  getParentDataAppPageId,
  moveNavItems,
} from "./utils";

describe("data app utils", () => {
  const dataAppWithoutHomepage = createMockDataApp({ dashboard_id: null });
  const dataAppWithHomepage = createMockDataApp({ dashboard_id: 3 });

  const page1 = createMockDataAppPage({ id: 1, name: "A" });
  const page2 = createMockDataAppPage({ id: 2, name: "B" });
  const page3 = createMockDataAppPage({ id: 3, name: "C" });
  const pages = [page1, page2, page3];

  describe("getDataAppHomePageId", () => {
    describe("with explicit homepage", () => {
      it("returns data app's dashboard_id", () => {
        expect(getDataAppHomePageId(dataAppWithHomepage, pages)).toEqual(
          dataAppWithHomepage.dashboard_id,
        );
      });

      it("returns data app's dashboard_id even if page list is empty", () => {
        expect(getDataAppHomePageId(dataAppWithHomepage, [])).toEqual(
          dataAppWithHomepage.dashboard_id,
        );
      });
    });

    describe("without explicit homepage", () => {
      it("returns fist page in alphabetical order", () => {
        expect(getDataAppHomePageId(dataAppWithoutHomepage, pages)).toEqual(
          page1.id,
        );
      });

      it("returns undefined when there're no pages", () => {
        expect(
          getDataAppHomePageId(dataAppWithoutHomepage, []),
        ).toBeUndefined();
      });
    });
  });

  describe("getParentDataAppPageId", () => {
    const navItems: DataAppNavItem[] = [
      { page_id: 1 },
      { page_id: 2, indent: 1 },
      { page_id: 3, indent: 0 },
      { page_id: 4, indent: 1 },
      { page_id: 5, indent: 1, hidden: true },
      { page_id: 6, indent: 2 },
    ];

    it("returns null if can't find page", () => {
      expect(
        getParentDataAppPageId(2, [
          { page_id: 1, indent: 1 },
          { page_id: 2, indent: 1 },
        ]),
      ).toBeNull();
    });

    it("returns null if page list is empty", () => {
      expect(getParentDataAppPageId(2, [])).toBeNull();
    });

    it("returns null for top-level page with undefined indent", () => {
      expect(getParentDataAppPageId(1, navItems)).toBeNull();
    });

    it("returns null for top-level page with 0 indent", () => {
      expect(getParentDataAppPageId(3, navItems)).toBeNull();
    });

    it("returns ID of the closest top-level page when indent is 1", () => {
      expect(getParentDataAppPageId(2, navItems)).toBe(1);
    });

    it("returns ID of the closest parent page by indent for visible pages", () => {
      expect(getParentDataAppPageId(4, navItems)).toBe(3);
    });

    it("returns ID of the closest parent page by indent for hidden pages", () => {
      expect(getParentDataAppPageId(5, navItems)).toBe(3);
    });

    it("skips hidden pages when looking for a parent", () => {
      expect(getParentDataAppPageId(6, navItems)).toBe(4);
    });
  });

  describe("moveNavItems", () => {
    it("swaps top level pages order", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2 },
        { page_id: 3 },
      ];

      expect(moveNavItems(navItems, 0, 2, { page_id: 1 })).toEqual([
        { page_id: 2 },
        { page_id: 3 },
        { page_id: 1 },
      ]);
    });

    it("swaps nested pages order", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3, indent: 1 },
        { page_id: 4, indent: 1 },
        { page_id: 5 },
      ];

      expect(moveNavItems(navItems, 1, 2, { page_id: 2, indent: 1 })).toEqual([
        { page_id: 1 },
        { page_id: 3, indent: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 4, indent: 1 },
        { page_id: 5 },
      ]);
    });

    it("moves a top-level page under another page", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2 },
        { page_id: 3 },
      ];

      expect(moveNavItems(navItems, 2, 1, { page_id: 3, indent: 1 })).toEqual([
        { page_id: 1 },
        { page_id: 3, indent: 1 },
        { page_id: 2 },
      ]);
    });

    it("moves a nested page to the top-level", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3 },
      ];

      expect(moveNavItems(navItems, 1, 1, { page_id: 2, indent: 0 })).toEqual([
        { page_id: 1 },
        { page_id: 2, indent: 0 },
        { page_id: 3 },
      ]);
    });

    it("moves a nested page under another page", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3 },
      ];

      expect(moveNavItems(navItems, 1, 2, { page_id: 2, indent: 1 })).toEqual([
        { page_id: 1 },
        { page_id: 3 },
        { page_id: 2, indent: 1 },
      ]);
    });

    it("moves nested pages together with parent", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2 },
        { page_id: 3, indent: 1 },
        { page_id: 4, indent: 1 },
        { page_id: 5, indent: 2 },
        { page_id: 6 },
        { page_id: 7 },
      ];

      expect(moveNavItems(navItems, 1, 5, { page_id: 2 })).toEqual([
        { page_id: 1 },
        { page_id: 6 },
        { page_id: 2 },
        { page_id: 3, indent: 1 },
        { page_id: 4, indent: 1 },
        { page_id: 5, indent: 2 },
        { page_id: 7 },
      ]);
    });

    it("swaps page groups", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3 },
        { page_id: 4, indent: 1 },
        { page_id: 5 },
        { page_id: 6, indent: 1 },
        { page_id: 7 },
      ];

      expect(moveNavItems(navItems, 4, 2, { page_id: 5 })).toEqual([
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 5 },
        { page_id: 6, indent: 1 },
        { page_id: 3 },
        { page_id: 4, indent: 1 },
        { page_id: 7 },
      ]);
    });

    it("moves nested pages together with parent from top to bottom", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3 },
        { page_id: 4, indent: 1 },
        { page_id: 5 },
        { page_id: 6, indent: 1 },
        { page_id: 7 },
      ];

      expect(moveNavItems(navItems, 4, 0, { page_id: 5 })).toEqual([
        { page_id: 5 },
        { page_id: 6, indent: 1 },
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3 },
        { page_id: 4, indent: 1 },
        { page_id: 7 },
      ]);
    });
  });
});
