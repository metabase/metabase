import type { DataAppNavItem } from "metabase-types/api";
import {
  createMockDataApp,
  createMockDataAppPage,
} from "metabase-types/api/mocks";
import {
  isTopLevelNavItem,
  getDataAppHomePageId,
  getParentDataAppPageId,
  getPreviousNavItem,
  getChildNavItems,
} from "./utils";

describe("data app utils", () => {
  const dataAppWithoutHomepage = createMockDataApp({ dashboard_id: null });
  const dataAppWithHomepage = createMockDataApp({ dashboard_id: 3 });

  const page1 = createMockDataAppPage({ id: 1, name: "A" });
  const page2 = createMockDataAppPage({ id: 2, name: "B" });
  const page3 = createMockDataAppPage({ id: 3, name: "C" });
  const pages = [page1, page2, page3];

  describe("isTopLevelNavItem", () => {
    it("returns true for items without indent", () => {
      expect(isTopLevelNavItem({ page_id: 1 })).toBe(true);
    });

    it("returns true for items with zero indent", () => {
      expect(isTopLevelNavItem({ page_id: 1, indent: 0 })).toBe(true);
    });

    it("returns false for nested items", () => {
      expect(isTopLevelNavItem({ page_id: 1, indent: 1 })).toBe(false);
    });

    it("returns false for nested hidden items", () => {
      expect(isTopLevelNavItem({ page_id: 1, hidden: true, indent: 1 })).toBe(
        false,
      );
    });

    it("returns false for hidden items without indent", () => {
      expect(isTopLevelNavItem({ page_id: 1, hidden: true })).toBe(false);
    });

    it("returns false for hidden items with zero indent", () => {
      expect(isTopLevelNavItem({ page_id: 1, hidden: true, indent: 0 })).toBe(
        false,
      );
    });
  });

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
      it("returns first top-level nav item page ID", () => {
        const dataApp = createMockDataApp({
          ...dataAppWithoutHomepage,
          nav_items: [{ page_id: 1, hidden: true }, { page_id: 8 }],
        });
        expect(getDataAppHomePageId(dataApp, pages)).toEqual(8);
      });

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

  describe("getChildNavItems", () => {
    it("returns child nav items for a given nav item", () => {
      const children = [
        { page_id: 4, indent: 1 },
        { page_id: 5, indent: 1 },
        { page_id: 6, indent: 2 },
      ];

      const navItems = [
        { page_id: 1 },
        { page_id: 2 },
        { page_id: 3 },
        ...children,
        { page_id: 7 },
        { page_id: 8 },
      ];

      expect(getChildNavItems(navItems, 3)).toEqual(children);
    });

    it("returns child nav items for a nested nav item", () => {
      const navItems = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3, indent: 2 },
      ];

      expect(getChildNavItems(navItems, 2)).toEqual([
        { page_id: 3, indent: 2 },
      ]);
    });

    it("returns an empty list if can't find nav item", () => {
      expect(getChildNavItems([{ page_id: 1 }, { page_id: 2 }], 3)).toEqual([]);
    });

    it("returns an empty list when there are no child pages", () => {
      const navItems = [{ page_id: 1 }, { page_id: 2 }, { page_id: 3 }];

      expect(getChildNavItems(navItems, 1)).toEqual([]);
      expect(getChildNavItems(navItems, 2)).toEqual([]);
      expect(getChildNavItems(navItems, 3)).toEqual([]);
    });
  });

  describe("getPreviousNavItem", () => {
    it("should return previous nav item", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2 },
        { page_id: 3 },
      ];

      expect(getPreviousNavItem(navItems, 3)).toEqual(navItems[1]);
    });

    it("should return null if there are no nav items", () => {
      expect(getPreviousNavItem([], 1)).toBeNull();
    });

    it("should return last nav item if unknown page ID was provided", () => {
      const navItems: DataAppNavItem[] = [{ page_id: 1 }, { page_id: 2 }];

      expect(getPreviousNavItem(navItems, 3)).toEqual(navItems[1]);
    });

    it("should return previous top-level nav item", () => {
      const navItems: DataAppNavItem[] = [
        { page_id: 1 },
        { page_id: 2, indent: 1 },
        { page_id: 3, indent: 1 },
        { page_id: 4 },
      ];

      expect(getPreviousNavItem(navItems, 3)).toEqual(navItems[0]);
    });
  });
});
