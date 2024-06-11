import type { PaletteActionImpl } from "./types";
import { processResults, processSection } from "./utils";

interface mockAction {
  name: string;
  section?: string;
}

const createMockAction = ({
  name,
  section = "basic",
}: mockAction): PaletteActionImpl => ({ name, section } as PaletteActionImpl);

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
});
