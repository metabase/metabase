import {
  dataStudioWorktree,
  dataStudioWorktrees,
  newNativeTransform,
  newPythonTransform,
  newQueryTransform,
  newTransformFromCard,
  transform,
  transformDependencies,
  transformEdit,
  transformIndexes,
  transformInspect,
  transformList,
  transformPythonLibrary,
  transformRun,
  transformSettings,
} from "./transforms";

describe("urls > transforms", () => {
  describe("dataStudioWorktrees", () => {
    it("should return the worktrees root URL", () => {
      expect(dataStudioWorktrees()).toBe("/data-studio/worktrees");
    });
  });

  describe("dataStudioWorktree", () => {
    it("should return a worktree URL", () => {
      expect(dataStudioWorktree(7)).toBe("/data-studio/worktrees/7");
    });
  });

  describe("transformList", () => {
    it("should return the main transform list URL", () => {
      expect(transformList()).toBe("/data-studio/transforms");
    });

    it("should include collectionId in the main list URL", () => {
      expect(transformList({ collectionId: 3 })).toBe(
        "/data-studio/transforms?collectionId=3",
      );
    });

    it("should return the worktree transform list URL", () => {
      expect(transformList({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms",
      );
    });

    it("should keep collectionId in worktree scope", () => {
      expect(transformList({ worktreeId: 7, collectionId: 3 })).toBe(
        "/data-studio/worktrees/7/transforms?collectionId=3",
      );
    });

    it("should fall back to the main list when worktreeId is null", () => {
      expect(transformList({ worktreeId: null })).toBe(
        "/data-studio/transforms",
      );
    });
  });

  describe("newQueryTransform", () => {
    it("should return the main new query transform URL", () => {
      expect(newQueryTransform()).toBe("/data-studio/transforms/new/query");
    });

    it("should return the worktree new query transform URL", () => {
      expect(newQueryTransform({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/new/query",
      );
    });
  });

  describe("newNativeTransform", () => {
    it("should return the main new native transform URL", () => {
      expect(newNativeTransform()).toBe("/data-studio/transforms/new/native");
    });

    it("should return the worktree new native transform URL", () => {
      expect(newNativeTransform({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/new/native",
      );
    });
  });

  describe("newPythonTransform", () => {
    it("should return the main new python transform URL", () => {
      expect(newPythonTransform()).toBe("/data-studio/transforms/new/python");
    });

    it("should return the worktree new python transform URL", () => {
      expect(newPythonTransform({ worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/new/python",
      );
    });
  });

  describe("newTransformFromCard", () => {
    it("should return the main new-from-card URL", () => {
      expect(newTransformFromCard(5)).toBe(
        "/data-studio/transforms/new/card/5",
      );
    });

    it("should return the worktree new-from-card URL", () => {
      expect(newTransformFromCard(5, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/new/card/5",
      );
    });
  });

  describe("transform", () => {
    it("should return the main transform URL", () => {
      expect(transform(10)).toBe("/data-studio/transforms/10");
    });

    it("should return the worktree transform URL", () => {
      expect(transform(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10",
      );
    });
  });

  describe("transformEdit", () => {
    it("should return the main transform edit URL", () => {
      expect(transformEdit(10)).toBe("/data-studio/transforms/10/edit");
    });

    it("should return the worktree transform edit URL", () => {
      expect(transformEdit(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/edit",
      );
    });
  });

  describe("transformRun", () => {
    it("should return the main transform run URL", () => {
      expect(transformRun(10)).toBe("/data-studio/transforms/10/run");
    });

    it("should return the worktree transform run URL", () => {
      expect(transformRun(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/run",
      );
    });
  });

  describe("transformSettings", () => {
    it("should return the main transform settings URL", () => {
      expect(transformSettings(10)).toBe("/data-studio/transforms/10/settings");
    });

    it("should return the worktree transform settings URL", () => {
      expect(transformSettings(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/settings",
      );
    });
  });

  describe("transformIndexes", () => {
    it("should return the main transform indexes URL", () => {
      expect(transformIndexes(10)).toBe("/data-studio/transforms/10/indexes");
    });

    it("should return the worktree transform indexes URL", () => {
      expect(transformIndexes(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/indexes",
      );
    });
  });

  describe("transformDependencies", () => {
    it("should return the main transform dependencies URL", () => {
      expect(transformDependencies(10)).toBe(
        "/data-studio/transforms/10/dependencies",
      );
    });

    it("should return the worktree transform dependencies URL", () => {
      expect(transformDependencies(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/dependencies",
      );
    });
  });

  describe("transformInspect", () => {
    it("should return the main transform inspect URL", () => {
      expect(transformInspect(10)).toBe("/data-studio/transforms/10/inspect");
    });

    it("should return the worktree transform inspect URL", () => {
      expect(transformInspect(10, { worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/10/inspect",
      );
    });
  });

  describe("transformPythonLibrary", () => {
    it("should return the main python library URL", () => {
      expect(transformPythonLibrary({ path: "common.py" })).toBe(
        "/data-studio/transforms/library/common.py",
      );
    });

    it("should return the worktree python library URL", () => {
      expect(transformPythonLibrary({ path: "common.py", worktreeId: 7 })).toBe(
        "/data-studio/worktrees/7/transforms/library/common.py",
      );
    });
  });
});
