import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { ObjectWithModel } from "metabase/common/utils/icon";
import type {
  Collection,
  IconName,
  RemoteSyncEntity,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncEntity,
  createMockRemoteSyncTask,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { TRANSFORMS_ROOT_ID } from "../../displayGroups";

import {
  countChanges,
  getEntityIcon,
  getSyncTaskSummary,
  getWorktreeEntityUrl,
  isFailedSyncTask,
} from "./utils";

const WORKTREE_ID = 7;

function createCollectionMap(collections: Collection[]) {
  return new Map(
    collections.map((collection) => [Number(collection.id), collection]),
  );
}

describe("WorktreeHomePage utils", () => {
  describe("countChanges", () => {
    it("returns zeros for no entities", () => {
      expect(countChanges([])).toEqual({ added: 0, modified: 0, removed: 0 });
    });

    it("counts create as added", () => {
      expect(
        countChanges([createMockRemoteSyncEntity({ sync_status: "create" })]),
      ).toEqual({ added: 1, modified: 0, removed: 0 });
    });

    it("counts delete as removed", () => {
      expect(
        countChanges([createMockRemoteSyncEntity({ sync_status: "delete" })]),
      ).toEqual({ added: 0, modified: 0, removed: 1 });
    });

    it("counts removed as removed", () => {
      expect(
        countChanges([createMockRemoteSyncEntity({ sync_status: "removed" })]),
      ).toEqual({ added: 0, modified: 0, removed: 1 });
    });

    it("counts update as modified", () => {
      expect(
        countChanges([createMockRemoteSyncEntity({ sync_status: "update" })]),
      ).toEqual({ added: 0, modified: 1, removed: 0 });
    });

    it("counts touch as modified", () => {
      expect(
        countChanges([createMockRemoteSyncEntity({ sync_status: "touch" })]),
      ).toEqual({ added: 0, modified: 1, removed: 0 });
    });

    it("groups a mixed list into all three buckets", () => {
      const entities = [
        createMockRemoteSyncEntity({ id: 1, sync_status: "create" }),
        createMockRemoteSyncEntity({ id: 2, sync_status: "create" }),
        createMockRemoteSyncEntity({ id: 3, sync_status: "update" }),
        createMockRemoteSyncEntity({ id: 4, sync_status: "touch" }),
        createMockRemoteSyncEntity({ id: 5, sync_status: "delete" }),
        createMockRemoteSyncEntity({ id: 6, sync_status: "removed" }),
        createMockRemoteSyncEntity({ id: 7, sync_status: "removed" }),
      ];
      expect(countChanges(entities)).toEqual({
        added: 2,
        modified: 2,
        removed: 3,
      });
    });
  });

  describe("getEntityIcon", () => {
    const getIcon = jest.fn((_item: ObjectWithModel): { name: IconName } => ({
      name: "bar",
    }));

    beforeEach(() => {
      getIcon.mockClear();
    });

    it("resolves models known to the icon map through the app-wide lookup", () => {
      const entity = createMockRemoteSyncEntity({
        id: 3,
        model: "card",
        display: "bar",
        authority_level: "official",
      });

      expect(getEntityIcon(entity, getIcon)).toBe("bar");
      expect(getIcon).toHaveBeenCalledWith({
        model: "card",
        id: 3,
        display: "bar",
        authority_level: "official",
      });
    });

    it("uses the field fallback icon", () => {
      const entity = createMockRemoteSyncEntity({ model: "field" });
      expect(getEntityIcon(entity, getIcon)).toBe("field");
      expect(getIcon).not.toHaveBeenCalled();
    });

    it("uses the transform tag fallback icon", () => {
      const entity = createMockRemoteSyncEntity({ model: "transformtag" });
      expect(getEntityIcon(entity, getIcon)).toBe("label");
      expect(getIcon).not.toHaveBeenCalled();
    });

    it("uses the transform job fallback icon", () => {
      const entity = createMockRemoteSyncEntity({ model: "transformjob" });
      expect(getEntityIcon(entity, getIcon)).toBe("clock");
      expect(getIcon).not.toHaveBeenCalled();
    });

    it("falls back to unknown for a model with neither an icon map entry nor a fallback", () => {
      const entity: RemoteSyncEntity = {
        ...createMockRemoteSyncEntity(),
        // Every model in the union has an icon, so reaching the defensive `?? "unknown"` branch
        // needs a value outside the union, like an unrecognized model coming from a newer API.
        model: "not-a-real-model" as RemoteSyncEntity["model"],
      };
      expect(getEntityIcon(entity, getIcon)).toBe("unknown");
      expect(getIcon).not.toHaveBeenCalled();
    });
  });

  describe("getWorktreeEntityUrl", () => {
    const emptyCollections = new Map<number, Collection>();

    it("opens transforms inside the worktree", () => {
      const entity = createMockRemoteSyncEntity({ id: 10, model: "transform" });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/transforms/10",
      );
    });

    it("opens snippets inside the worktree library", () => {
      const entity = createMockRemoteSyncEntity({
        id: 11,
        model: "nativequerysnippet",
      });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/library/snippets/11",
      );
    });

    it("opens metrics inside the worktree library", () => {
      const entity = createMockRemoteSyncEntity({ id: 12, model: "metric" });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/library/metrics/12",
      );
    });

    it("opens tables inside the worktree library", () => {
      const entity = createMockRemoteSyncEntity({ id: 42, model: "table" });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/library/tables/42",
      );
    });

    it("opens measures under their table inside the worktree library", () => {
      const entity = createMockRemoteSyncEntity({
        id: 13,
        model: "measure",
        table_id: 42,
      });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/library/tables/42/measures/13",
      );
    });

    it("has no page for a measure without a table_id", () => {
      const entity = createMockRemoteSyncEntity({ id: 13, model: "measure" });
      expect(
        getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections),
      ).toBeNull();
    });

    it("opens segments under their table inside the worktree library", () => {
      const entity = createMockRemoteSyncEntity({
        id: 14,
        model: "segment",
        table_id: 42,
      });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/data-studio/worktrees/7/library/tables/42/segments/14",
      );
    });

    it("has no page for a segment without a table_id", () => {
      const entity = createMockRemoteSyncEntity({ id: 14, model: "segment" });
      expect(
        getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections),
      ).toBeNull();
    });

    it.each<RemoteSyncEntity["model"]>([
      "field",
      "transformtag",
      "transformjob",
      "pythonlibrary",
    ])("has no page for %s entities", (model) => {
      const entity = createMockRemoteSyncEntity({ id: 15, model });
      expect(
        getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections),
      ).toBeNull();
    });

    it("falls back to the main app URL for models without a worktree page", () => {
      const entity = createMockRemoteSyncEntity({
        id: 16,
        model: "dashboard",
        name: "Sales Overview",
      });
      expect(getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections)).toBe(
        "/dashboard/16-sales-overview",
      );
    });

    describe("collections", () => {
      beforeAll(() => {
        mockSettings({
          "token-features": createMockTokenFeatures({ library: true }),
        });
        setupEnterprisePlugins();
      });

      it("opens the virtual transforms root as the worktree transform list", () => {
        const entity = createMockRemoteSyncEntity({
          id: TRANSFORMS_ROOT_ID,
          model: "collection",
          name: "Transforms",
        });
        expect(
          getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections),
        ).toBe("/data-studio/worktrees/7/transforms");
      });

      it("opens a transforms-namespace collection as a filtered worktree transform list", () => {
        const collection = createMockCollection({
          id: 20,
          name: "Nightly",
          namespace: "transforms",
        });
        const entity = createMockRemoteSyncEntity({
          id: 20,
          model: "collection",
          name: "Nightly",
        });
        expect(
          getWorktreeEntityUrl(
            entity,
            WORKTREE_ID,
            createCollectionMap([collection]),
          ),
        ).toBe("/data-studio/worktrees/7/transforms?collectionId=20");
      });

      it("opens a library collection as the worktree library", () => {
        const collection = createMockCollection({
          id: 21,
          name: "Library",
          type: "library",
        });
        const entity = createMockRemoteSyncEntity({
          id: 21,
          model: "collection",
          name: "Library",
        });
        expect(
          getWorktreeEntityUrl(
            entity,
            WORKTREE_ID,
            createCollectionMap([collection]),
          ),
        ).toBe("/data-studio/worktrees/7/library");
      });

      it("falls back to the main app URL for a regular collection", () => {
        const collection = createMockCollection({
          id: 22,
          name: "Marketing",
        });
        const entity = createMockRemoteSyncEntity({
          id: 22,
          model: "collection",
          name: "Marketing",
        });
        expect(
          getWorktreeEntityUrl(
            entity,
            WORKTREE_ID,
            createCollectionMap([collection]),
          ),
        ).toBe("/collection/22-marketing");
      });

      it("falls back to the main app URL for a collection missing from the map", () => {
        const entity = createMockRemoteSyncEntity({
          id: 23,
          model: "collection",
          name: "Orphan",
        });
        expect(
          getWorktreeEntityUrl(entity, WORKTREE_ID, emptyCollections),
        ).toBe("/collection/23-orphan");
      });
    });
  });

  describe("getSyncTaskSummary", () => {
    it.each([
      ["running", "Pulling changes", "Pushing changes"],
      ["errored", "Pull failed", "Push failed"],
      ["cancelled", "Pull cancelled", "Push cancelled"],
      ["timed-out", "Pull timed out", "Push timed out"],
      ["conflict", "Pull hit conflicts", "Push hit conflicts"],
    ] as const)("describes a %s task", (status, pullSummary, pushSummary) => {
      expect(
        getSyncTaskSummary(
          createMockRemoteSyncTask({ status, sync_task_type: "import" }),
        ),
      ).toBe(pullSummary);
      expect(
        getSyncTaskSummary(
          createMockRemoteSyncTask({ status, sync_task_type: "export" }),
        ),
      ).toBe(pushSummary);
    });

    describe("successful", () => {
      it("reports a single pulled item", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "import",
          outcome: { kind: "pulled", count: 1, branch: "main" },
        });
        expect(getSyncTaskSummary(task)).toBe("Pulled 1 item");
      });

      it("reports multiple pulled items", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "import",
          outcome: { kind: "pulled", count: 3, branch: "main" },
        });
        expect(getSyncTaskSummary(task)).toBe("Pulled 3 items");
      });

      it("reports a single pushed item", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "export",
          outcome: { kind: "pushed", count: 1, branch: "main" },
        });
        expect(getSyncTaskSummary(task)).toBe("Pushed 1 item");
      });

      it("reports multiple pushed items", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "export",
          outcome: { kind: "pushed", count: 5, branch: "main" },
        });
        expect(getSyncTaskSummary(task)).toBe("Pushed 5 items");
      });

      it("reports a merge with both directions", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "export",
          outcome: { kind: "merged", pulled: 2, pushed: 4, branch: "main" },
        });
        expect(getSyncTaskSummary(task)).toBe("Merged: pulled 2, pushed 4");
      });

      it("reports a skipped pull", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "import",
          outcome: { kind: "pull-skipped" },
        });
        expect(getSyncTaskSummary(task)).toBe("Nothing to pull");
      });

      it("reports a skipped push", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "export",
          outcome: { kind: "push-skipped" },
        });
        expect(getSyncTaskSummary(task)).toBe("Nothing to push");
      });

      it("falls back to generic pull copy when the outcome is missing", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "import",
          outcome: null,
        });
        expect(getSyncTaskSummary(task)).toBe("Pulled changes");
      });

      it("falls back to generic push copy when the outcome is missing", () => {
        const task = createMockRemoteSyncTask({
          status: "successful",
          sync_task_type: "export",
        });
        expect(getSyncTaskSummary(task)).toBe("Pushed changes");
      });
    });
  });

  describe("isFailedSyncTask", () => {
    it.each(["errored", "timed-out", "conflict"] as const)(
      "treats %s as failed",
      (status) => {
        expect(isFailedSyncTask(createMockRemoteSyncTask({ status }))).toBe(
          true,
        );
      },
    );

    it.each(["running", "successful", "cancelled"] as const)(
      "does not treat %s as failed",
      (status) => {
        expect(isFailedSyncTask(createMockRemoteSyncTask({ status }))).toBe(
          false,
        );
      },
    );
  });
});
