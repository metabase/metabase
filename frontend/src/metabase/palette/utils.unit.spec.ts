import type { PaletteActionImpl } from "./types";
import { navigateActionIndex, processResults, processSection } from "./utils";

interface mockAction {
  name: string;
  section?: string;
  disabled?: boolean;
}

const createMockAction = ({
  name,
  section = "basic",
  disabled,
}: mockAction): PaletteActionImpl =>
  ({ name, section, disabled } as PaletteActionImpl);

describe("command palette utils", () => {
  describe("processSection", () => {
    it("should add the section name to the beginning if there are items", () => {
      const items = [
        createMockAction({ name: "foo" }),
        createMockAction({ name: "bar" }),
      ];

      const result = processSection("Basic", items);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe("Basic");
    });
    it("should return an empty list if there are no items", () => {
      const items: PaletteActionImpl[] = [];
      const result = processSection("Basic", items);
      expect(result).toHaveLength(0);
    });
  });

  describe("processResults", () => {
    const testActions = [
      ...new Array(10)
        .fill(0)
        .map((_, index) => createMockAction({ name: `action ${index}` })),
    ];
    const testSearch = [
      ...new Array(5)
        .fill(0)
        .map((_, index) =>
          createMockAction({ name: `search ${index}`, section: "search" }),
        ),
    ];
    const testRecent = [
      ...new Array(5)
        .fill(0)
        .map((_, index) =>
          createMockAction({ name: `recent ${index}`, section: "recent" }),
        ),
    ];
    const testAdmin = [
      ...new Array(10)
        .fill(0)
        .map((_, index) =>
          createMockAction({ name: `admin ${index}`, section: "admin" }),
        ),
    ];
    const testDoc = [createMockAction({ name: "doc action", section: "docs" })];

    it("should limit to 6 actions including header", () => {
      const result = processResults(testActions);
      expect(result).toHaveLength(6);
      expect(result[0]).toBe("Actions");
    });

    it("should not limit the other action types", () => {
      expect(processResults([...testActions, ...testSearch])).toHaveLength(12);
      expect(processResults([...testActions, ...testRecent])).toHaveLength(12);
      expect(
        processResults([...testRecent, ...testAdmin, ...testDoc]),
      ).toHaveLength(19);
    });

    it("should add a header to doc", () => {
      expect(processResults([...testDoc])).toHaveLength(2);
    });

    it("should enforce a specific order", () => {
      const results = processResults([
        ...testSearch,
        ...testDoc,
        ...testAdmin,
        ...testActions,
        ...testRecent,
      ]);

      const actionsIndex = results.findIndex(action => action === "Actions");
      const searchIndex = results.findIndex(
        action => action === "Search results",
      );
      const recentsIndex = results.findIndex(
        action => action === "Recent items",
      );
      const adminIndex = results.findIndex(action => action === "Admin");

      [recentsIndex, actionsIndex, adminIndex, searchIndex].forEach(
        (val, i, arr) => {
          expect(val).not.toBe(-1);
          const next = arr[i + 1] || Infinity; //can't call expect in an if, so this lets us do the last comparison
          expect(val).toBeLessThan(next);
        },
      );
    });
  });

  describe("navigateActionIndex", () => {
    const DISABLED = createMockAction({ name: "disabled", disabled: true });
    const NORMAL = createMockAction({ name: "normal" });

    it("should navigate to the next index", () => {
      const items = [NORMAL, NORMAL, NORMAL];
      const index = 0;
      expect(navigateActionIndex(items, index, 1)).toBe(1);
    });
    it("should navigate to the previous index", () => {
      const items = [NORMAL, NORMAL, NORMAL];
      const index = 1;
      expect(navigateActionIndex(items, index, -1)).toBe(0);
    });
    it("should navigate not navigate off the list", () => {
      const items = [NORMAL, NORMAL, NORMAL];
      expect(navigateActionIndex(items, 0, -1)).toBe(0);
      expect(navigateActionIndex(items, 0, -4)).toBe(0);
      expect(navigateActionIndex(items, 2, 1)).toBe(2);
      expect(navigateActionIndex(items, 2, 10)).toBe(2);
    });
    it("should handle indexes being out of normal bounds", () => {
      const items = [NORMAL, NORMAL, NORMAL];
      expect(navigateActionIndex(items, -3, -1)).toBe(0);
      expect(navigateActionIndex(items, -3, 1)).toBe(0);

      expect(navigateActionIndex(items, 20, 1)).toBe(2);
      expect(navigateActionIndex(items, 20, -1)).toBe(2);
    });
    it("should navigate past strings", () => {
      const items = [NORMAL, "foo", NORMAL, NORMAL];
      expect(navigateActionIndex(items, 0, 1)).toBe(2);
      expect(navigateActionIndex(items, 2, -1)).toBe(0);
    });
    it("should navigate past disabled items", () => {
      const items = [NORMAL, DISABLED, NORMAL, NORMAL];
      expect(navigateActionIndex(items, 0, 1)).toBe(2);
      expect(navigateActionIndex(items, 2, -1)).toBe(0);
    });
    it("should handle disabled items and strings near boundries", () => {
      const short = [DISABLED, NORMAL, NORMAL, NORMAL, "foo"];
      expect(navigateActionIndex(short, 3, 1)).toBe(3);
      expect(navigateActionIndex(short, 1, -1)).toBe(1);

      const long = [DISABLED, DISABLED, NORMAL, NORMAL, NORMAL, "foo", "foo"];
      expect(navigateActionIndex(long, 4, 1)).toBe(4);
      expect(navigateActionIndex(long, 4, 2)).toBe(4);
      expect(navigateActionIndex(long, 4, 3)).toBe(4);
      expect(navigateActionIndex(long, 3, 2)).toBe(4);
      expect(navigateActionIndex(long, 3, 3)).toBe(4);

      expect(navigateActionIndex(long, 2, -1)).toBe(2);
      expect(navigateActionIndex(long, 2, -2)).toBe(2);
      expect(navigateActionIndex(long, 2, -3)).toBe(2);
      expect(navigateActionIndex(long, 3, -2)).toBe(2);
      expect(navigateActionIndex(long, 3, -4)).toBe(2);
    });

    it("should handle when current index is a string or disabled", () => {
      const items = [DISABLED, DISABLED, NORMAL, NORMAL, NORMAL, "foo", "foo"];
      expect(navigateActionIndex(items, 1, 1)).toBe(2);
      expect(navigateActionIndex(items, 1, -1)).toBe(2);
      expect(navigateActionIndex(items, 5, 1)).toBe(4);
      expect(navigateActionIndex(items, 6, -1)).toBe(4);
    });

    it("should always find a valid index if one is available", () => {
      const items = [DISABLED, DISABLED, "foo", NORMAL, DISABLED, "foo", "foo"];

      expect(navigateActionIndex(items, 4, 1)).toBe(3);
      expect(navigateActionIndex(items, 4, 2)).toBe(3);
      expect(navigateActionIndex(items, 4, 3)).toBe(3);
      expect(navigateActionIndex(items, 3, 2)).toBe(3);
      expect(navigateActionIndex(items, 3, 3)).toBe(3);

      expect(navigateActionIndex(items, 2, -1)).toBe(3);
      expect(navigateActionIndex(items, 2, -2)).toBe(3);
      expect(navigateActionIndex(items, 2, -3)).toBe(3);
      expect(navigateActionIndex(items, 3, -2)).toBe(3);
      expect(navigateActionIndex(items, 3, -4)).toBe(3);
    });

    it("should return the current index if no valid options are available", () => {
      const items = [DISABLED, DISABLED, "foo", DISABLED, "foo", "foo"];

      expect(navigateActionIndex(items, 4, 1)).toBe(4);
      expect(navigateActionIndex(items, 4, 2)).toBe(4);
      expect(navigateActionIndex(items, 4, 3)).toBe(4);
      expect(navigateActionIndex(items, 3, 2)).toBe(3);
      expect(navigateActionIndex(items, 3, 3)).toBe(3);

      expect(navigateActionIndex(items, 2, -1)).toBe(2);
      expect(navigateActionIndex(items, 2, -2)).toBe(2);
      expect(navigateActionIndex(items, 2, -3)).toBe(2);
      expect(navigateActionIndex(items, 3, -2)).toBe(3);
      expect(navigateActionIndex(items, 3, -4)).toBe(3);
    });
  });
});
