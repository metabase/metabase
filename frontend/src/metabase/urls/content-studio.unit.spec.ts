import {
  contentStudio,
  contentStudioCollection,
  contentStudioCollections,
  contentStudioQuestion,
  contentStudioSnippet,
  contentStudioSnippets,
  contentStudioTransforms,
  extractContentStudioCollectionIdFromPath,
} from "./content-studio";

describe("urls > content-studio", () => {
  describe("contentStudio", () => {
    it("should return root URL", () => {
      expect(contentStudio()).toBe("/content-studio");
    });
  });

  describe("contentStudioCollections", () => {
    it("should return the main scope URL when no worktree is given", () => {
      expect(contentStudioCollections()).toBe("/content-studio/collections");
    });

    it("should scope to a worktree", () => {
      expect(contentStudioCollections({ worktreeId: 7 })).toBe(
        "/content-studio/collections?worktree=7",
      );
    });
  });

  describe("contentStudioCollection", () => {
    it("should build a slugged URL from a collection", () => {
      expect(contentStudioCollection({ id: 3, name: "My Collection" })).toBe(
        "/content-studio/collection/3-my-collection",
      );
    });

    it("should build a URL from an id", () => {
      expect(contentStudioCollection(3)).toBe("/content-studio/collection/3");
    });

    it("should build a URL for the root collection", () => {
      expect(contentStudioCollection("root")).toBe(
        "/content-studio/collection/root",
      );
    });
  });

  describe("contentStudioQuestion", () => {
    it("should build a slugged URL from a card", () => {
      expect(contentStudioQuestion({ id: 7, name: "Revenue" })).toBe(
        "/content-studio/question/7-revenue",
      );
    });

    it("should build a URL from an id", () => {
      expect(contentStudioQuestion(7)).toBe("/content-studio/question/7");
    });
  });

  describe("contentStudioTransforms", () => {
    it("should return the main scope URL when no worktree is given", () => {
      expect(contentStudioTransforms()).toBe("/content-studio/transforms");
    });

    it("should scope to a worktree", () => {
      expect(contentStudioTransforms({ worktreeId: 7 })).toBe(
        "/content-studio/transforms?worktree=7",
      );
    });
  });

  describe("contentStudioSnippets", () => {
    it("should return the main scope URL when no worktree is given", () => {
      expect(contentStudioSnippets()).toBe("/content-studio/snippets");
    });

    it("should scope to a worktree", () => {
      expect(contentStudioSnippets({ worktreeId: 7 })).toBe(
        "/content-studio/snippets?worktree=7",
      );
    });
  });

  describe("extractContentStudioCollectionIdFromPath", () => {
    it.each([
      ["/content-studio/collection/3-my-collection", 3],
      ["/content-studio/collection/3", 3],
      ["/content-studio/collection/root", "root"],
    ])("should extract the collection id from %s", (path, expected) => {
      expect(extractContentStudioCollectionIdFromPath(path)).toBe(expected);
    });

    it.each([
      "/content-studio/collections",
      "/collection/3-my-collection",
      "/content-studio/snippets/3",
    ])("should not extract a collection id from %s", (path) => {
      expect(extractContentStudioCollectionIdFromPath(path)).toBeUndefined();
    });
  });

  describe("contentStudioSnippet", () => {
    it("should return the snippet URL", () => {
      expect(contentStudioSnippet(42)).toBe("/content-studio/snippets/42");
    });
  });
});
