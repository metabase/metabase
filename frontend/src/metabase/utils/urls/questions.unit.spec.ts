import { newQuestion } from "./questions";

describe("urls > questions", () => {
  describe("newQuestion", () => {
    it("should return the correct url", () => {
      const hash =
        "eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjpudWxsLCJsaWIvdHlwZSI6Im1icWwvcXVlcnkiLCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9tYnFsIiwic291cmNlLXRhYmxlIjpudWxsfV19LCJkaXNwbGF5IjoidGFibGUiLCJwYXJhbWV0ZXJWYWx1ZXMiOnt9LCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7fX0=";

      expect(newQuestion({ mode: "query" })).toBe(`/question/query#${hash}`);
      expect(newQuestion({ mode: "notebook" })).toBe(
        `/question/notebook#${hash}`,
      );
      expect(newQuestion({ mode: "view" })).toBe(`/question/view#${hash}`);
      expect(newQuestion({ mode: "ask" })).toBe("/question/ask");
    });
  });
});
