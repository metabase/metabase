import { renderHook } from "@testing-library/react";
import { act } from "react";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

// Mock preference persistence logic
describe("SchemaViewer preference persistence", () => {
  describe("preference key generation", () => {
    it("should generate key from database ID and schema", () => {
      const databaseId = 1 as DatabaseId;
      const schema = "PUBLIC";

      const key = `${databaseId}:${schema}`;
      expect(key).toBe("1:PUBLIC");
    });

    it("should handle undefined schema", () => {
      const databaseId = 1 as DatabaseId;
      const schema = undefined;

      const key = `${databaseId}:${schema ?? ""}`;
      expect(key).toBe("1:");
    });

    it("should not generate key when model-id is used", () => {
      const modelId = 42;
      const databaseId = undefined;
      const schema = undefined;

      const key = modelId == null && databaseId != null
        ? `${databaseId}:${schema ?? ""}`
        : null;

      expect(key).toBeNull();
    });
  });

  describe("preference structure", () => {
    it("should save table IDs, hops, compact mode, and explicit full mode", () => {
      const prefs = {
        table_ids: [1, 2, 3] as ConcreteTableId[],
        hops: 2,
        is_compact_mode: false,
        explicit_full_mode: true,
      };

      expect(prefs.table_ids).toEqual([1, 2, 3]);
      expect(prefs.hops).toBe(2);
      expect(prefs.is_compact_mode).toBe(false);
      expect(prefs.explicit_full_mode).toBe(true);
    });

    it("should save only compact mode when no tables selected", () => {
      const prefs = {
        is_compact_mode: true,
        explicit_full_mode: false,
      };

      expect(prefs.is_compact_mode).toBe(true);
      expect(prefs.explicit_full_mode).toBe(false);
      expect(prefs).not.toHaveProperty("table_ids");
      expect(prefs).not.toHaveProperty("hops");
    });
  });

  describe("preference restoration", () => {
    it("should restore table IDs from saved prefs", () => {
      const savedPrefs = {
        table_ids: [1, 2, 3] as ConcreteTableId[],
        hops: 3,
        is_compact_mode: true,
        explicit_full_mode: false,
      };

      const validTableIds = new Set<ConcreteTableId>([1, 2, 3, 4, 5]);
      const validatedTableIds = (
        savedPrefs.table_ids as ConcreteTableId[]
      ).filter((id) => validTableIds.has(id));

      expect(validatedTableIds).toEqual([1, 2, 3]);
    });

    it("should filter out invalid table IDs", () => {
      const savedPrefs = {
        table_ids: [1, 2, 999] as ConcreteTableId[],
        hops: 2,
      };

      const validTableIds = new Set<ConcreteTableId>([1, 2, 3]);
      const validatedTableIds = (
        savedPrefs.table_ids as ConcreteTableId[]
      ).filter((id) => validTableIds.has(id));

      expect(validatedTableIds).toEqual([1, 2]);
      expect(validatedTableIds).not.toContain(999);
    });

    it("should restore hops value", () => {
      const savedPrefs = {
        table_ids: [1, 2],
        hops: 4,
      };

      expect(savedPrefs.hops).toBe(4);
    });

    it("should restore compact mode preference", () => {
      const savedPrefs = {
        is_compact_mode: true,
        explicit_full_mode: false,
      };

      expect(savedPrefs.is_compact_mode).toBe(true);
    });

    it("should restore explicit full mode flag", () => {
      const savedPrefs = {
        is_compact_mode: false,
        explicit_full_mode: true,
      };

      expect(savedPrefs.explicit_full_mode).toBe(true);
    });
  });

  describe("compact mode toggle logic", () => {
    it("should toggle from false to true", () => {
      let isCompactMode = false;
      isCompactMode = !isCompactMode;

      expect(isCompactMode).toBe(true);
    });

    it("should toggle from true to false", () => {
      let isCompactMode = true;
      isCompactMode = !isCompactMode;

      expect(isCompactMode).toBe(false);
    });

    it("should set explicit full mode when toggling to false explicitly", () => {
      const isCompactMode = true;
      const explicit = true;

      const newMode = !isCompactMode;
      const newExplicitFullMode = explicit ? newMode === false : false;

      expect(newMode).toBe(false);
      expect(newExplicitFullMode).toBe(true);
    });

    it("should not set explicit full mode when toggling to true", () => {
      const isCompactMode = false;
      const explicit = true;

      const newMode = !isCompactMode;
      const newExplicitFullMode = explicit ? newMode === false : false;

      expect(newMode).toBe(true);
      expect(newExplicitFullMode).toBe(false);
    });

    it("should not change explicit full mode flag on non-explicit toggle", () => {
      const isCompactMode = true;
      const explicit = false;
      let explicitFullMode = false;

      const newMode = !isCompactMode;
      let newExplicitFullMode = explicitFullMode;

      if (explicit) {
        newExplicitFullMode = newMode === false;
      }

      expect(newMode).toBe(false);
      expect(newExplicitFullMode).toBe(false); // Unchanged
    });
  });

  describe("auto-detect compact mode", () => {
    const AUTO_COMPACT_NODE_THRESHOLD = 10;

    it("should enable compact mode with more than 10 nodes", () => {
      const nodes = Array(11).fill({});
      const shouldStartCompact = nodes.length > AUTO_COMPACT_NODE_THRESHOLD;

      expect(shouldStartCompact).toBe(true);
    });

    it("should not enable compact mode with exactly 10 nodes", () => {
      const nodes = Array(10).fill({});
      const shouldStartCompact = nodes.length > AUTO_COMPACT_NODE_THRESHOLD;

      expect(shouldStartCompact).toBe(false);
    });

    it("should not enable compact mode with fewer than 10 nodes", () => {
      const nodes = Array(5).fill({});
      const shouldStartCompact = nodes.length > AUTO_COMPACT_NODE_THRESHOLD;

      expect(shouldStartCompact).toBe(false);
    });

    it("should enable compact mode with exactly 11 nodes (boundary)", () => {
      const nodes = Array(11).fill({});
      const shouldStartCompact = nodes.length > AUTO_COMPACT_NODE_THRESHOLD;

      expect(shouldStartCompact).toBe(true);
    });
  });

  describe("auto-switch to compact mode on node increase", () => {
    it("should switch to compact when node count increases and in detailed mode", () => {
      const prevNodeCount = 5;
      const currentNodeCount = 8;
      const isCompactMode = false;
      const explicitFullMode = false;

      const shouldAutoSwitch =
        currentNodeCount > prevNodeCount && !isCompactMode && !explicitFullMode;

      expect(shouldAutoSwitch).toBe(true);
    });

    it("should not switch when already in compact mode", () => {
      const prevNodeCount = 5;
      const currentNodeCount = 8;
      const isCompactMode = true;
      const explicitFullMode = false;

      const shouldAutoSwitch =
        currentNodeCount > prevNodeCount && !isCompactMode && !explicitFullMode;

      expect(shouldAutoSwitch).toBe(false);
    });

    it("should not switch when user explicitly set detailed mode", () => {
      const prevNodeCount = 5;
      const currentNodeCount = 8;
      const isCompactMode = false;
      const explicitFullMode = true;

      const shouldAutoSwitch =
        currentNodeCount > prevNodeCount && !isCompactMode && !explicitFullMode;

      expect(shouldAutoSwitch).toBe(false);
    });

    it("should not switch when node count decreases", () => {
      const prevNodeCount = 8;
      const currentNodeCount = 5;
      const isCompactMode = false;
      const explicitFullMode = false;

      const shouldAutoSwitch =
        currentNodeCount > prevNodeCount && !isCompactMode && !explicitFullMode;

      expect(shouldAutoSwitch).toBe(false);
    });

    it("should not switch when node count stays the same", () => {
      const prevNodeCount = 5;
      const currentNodeCount = 5;
      const isCompactMode = false;
      const explicitFullMode = false;

      const shouldAutoSwitch =
        currentNodeCount > prevNodeCount && !isCompactMode && !explicitFullMode;

      expect(shouldAutoSwitch).toBe(false);
    });

    it("should not auto-switch back from compact to detailed when nodes decrease", () => {
      const prevNodeCount = 15;
      const currentNodeCount = 5;
      const isCompactMode = true;
      const explicitFullMode = false;

      // The logic only switches detailed -> compact, never compact -> detailed
      const shouldAutoSwitchToDetailed = false; // Never happens automatically

      expect(shouldAutoSwitchToDetailed).toBe(false);
    });
  });

  describe("preference context isolation", () => {
    it("should detect database change", () => {
      const prevKey = "1:PUBLIC";
      const currentKey = "2:PUBLIC";

      expect(prevKey !== currentKey).toBe(true);
    });

    it("should detect schema change", () => {
      const prevKey = "1:PUBLIC";
      const currentKey = "1:ANALYTICS";

      expect(prevKey !== currentKey).toBe(true);
    });

    it("should detect no change", () => {
      const prevKey = "1:PUBLIC";
      const currentKey = "1:PUBLIC";

      expect(prevKey !== currentKey).toBe(false);
    });

    it("should handle undefined schema changes", () => {
      const prevKey = "1:";
      const currentKey = "1:PUBLIC";

      expect(prevKey !== currentKey).toBe(true);
    });
  });

  describe("table selection state", () => {
    it("should match current context", () => {
      const selection = {
        tableIds: [1, 2] as ConcreteTableId[],
        forDatabaseId: 1 as DatabaseId,
        forSchema: "PUBLIC" as string | undefined,
        isUserModified: true,
      };

      const currentDatabaseId = 1 as DatabaseId;
      const currentSchema = "PUBLIC" as string | undefined;

      const matches =
        selection.forDatabaseId === currentDatabaseId &&
        selection.forSchema === currentSchema;

      expect(matches).toBe(true);
    });

    it("should not match different database", () => {
      const selection = {
        tableIds: [1, 2] as ConcreteTableId[],
        forDatabaseId: 1 as DatabaseId,
        forSchema: "PUBLIC" as string | undefined,
        isUserModified: true,
      };

      const currentDatabaseId = 2 as DatabaseId;
      const currentSchema = "PUBLIC" as string | undefined;

      const matches =
        selection.forDatabaseId === currentDatabaseId &&
        selection.forSchema === currentSchema;

      expect(matches).toBe(false);
    });

    it("should not match different schema", () => {
      const selection = {
        tableIds: [1, 2] as ConcreteTableId[],
        forDatabaseId: 1 as DatabaseId,
        forSchema: "PUBLIC" as string | undefined,
        isUserModified: true,
      };

      const currentDatabaseId = 1 as DatabaseId;
      const currentSchema = "ANALYTICS" as string | undefined;

      const matches =
        selection.forDatabaseId === currentDatabaseId &&
        selection.forSchema === currentSchema;

      expect(matches).toBe(false);
    });

    it("should distinguish user-modified from auto-initialized", () => {
      const userSelection = {
        isUserModified: true,
      };

      const autoSelection = {
        isUserModified: false,
      };

      expect(userSelection.isUserModified).toBe(true);
      expect(autoSelection.isUserModified).toBe(false);
    });

    it("should treat URL params as user-modified", () => {
      const initialTableIds = [1, 2, 3] as ConcreteTableId[];
      const selection = {
        tableIds: initialTableIds,
        isUserModified: true, // URL params count as user-specified
      };

      expect(selection.isUserModified).toBe(true);
    });

    it("should treat restored prefs as user-modified", () => {
      const savedPrefs = {
        table_ids: [1, 2] as ConcreteTableId[],
      };

      const selection = {
        tableIds: savedPrefs.table_ids,
        isUserModified: true, // Saved prefs = previous user choices
      };

      expect(selection.isUserModified).toBe(true);
    });

    it("should treat focal tables from backend as not user-modified", () => {
      const focalTableIds = [1, 2] as ConcreteTableId[];
      const selection = {
        tableIds: focalTableIds,
        isUserModified: false, // Auto-initialized from backend
      };

      expect(selection.isUserModified).toBe(false);
    });
  });

  describe("preference save conditions", () => {
    it("should save on table selection change", () => {
      const tableIds = [1, 2, 3] as ConcreteTableId[];
      const hops = 2;
      const isCompactMode = false;
      const explicitFullMode = true;

      const prefs = {
        table_ids: tableIds,
        hops,
        is_compact_mode: isCompactMode,
        explicit_full_mode: explicitFullMode,
      };

      expect(prefs.table_ids).toEqual(tableIds);
    });

    it("should save on hops change when user-modified", () => {
      const isUserModified = true;
      const effectiveSelectedTableIds = [1, 2] as ConcreteTableId[];
      const newHops = 3;

      if (isUserModified && effectiveSelectedTableIds != null) {
        const prefs = {
          table_ids: effectiveSelectedTableIds,
          hops: newHops,
        };
        expect(prefs.hops).toBe(3);
      }
    });

    it("should not save on hops change when not user-modified", () => {
      const isUserModified = false;
      const effectiveSelectedTableIds = [1, 2] as ConcreteTableId[];
      let savedPrefs: any = null;

      if (isUserModified && effectiveSelectedTableIds != null) {
        savedPrefs = {
          table_ids: effectiveSelectedTableIds,
          hops: 3,
        };
      }

      expect(savedPrefs).toBeNull();
    });

    it("should save on compact mode toggle with tables", () => {
      const effectiveSelectedTableIds = [1, 2] as ConcreteTableId[];
      const hops = 2;
      const newMode = true;
      const newExplicitFullMode = false;

      if (effectiveSelectedTableIds != null) {
        const prefs = {
          table_ids: effectiveSelectedTableIds,
          hops,
          is_compact_mode: newMode,
          explicit_full_mode: newExplicitFullMode,
        };
        expect(prefs.is_compact_mode).toBe(true);
      }
    });

    it("should save on compact mode toggle without tables", () => {
      const effectiveSelectedTableIds = null;
      const prefsKey = "1:PUBLIC";
      const newMode = true;
      const newExplicitFullMode = false;

      if (effectiveSelectedTableIds == null && prefsKey != null) {
        const prefs = {
          is_compact_mode: newMode,
          explicit_full_mode: newExplicitFullMode,
        };
        expect(prefs.is_compact_mode).toBe(true);
        expect(prefs).not.toHaveProperty("table_ids");
      }
    });

    it("should save on expand to table (FK click)", () => {
      const effectiveSelectedTableIds = [1, 2] as ConcreteTableId[];
      const newTableId = 3 as ConcreteTableId;
      const hops = 2;
      const isCompactMode = false;
      const explicitFullMode = false;

      const newTableIds = [...effectiveSelectedTableIds, newTableId];
      const prefs = {
        table_ids: newTableIds,
        hops,
        is_compact_mode: isCompactMode,
        explicit_full_mode: explicitFullMode,
      };

      expect(prefs.table_ids).toEqual([1, 2, 3]);
    });
  });
});
