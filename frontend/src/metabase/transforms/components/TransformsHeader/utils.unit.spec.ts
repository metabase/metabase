import {
  isTransformsJobsRoute,
  isTransformsMainRoute,
  isTransformsRunsRoute,
} from "./utils";

describe("TransformsHeader/utils", () => {
  describe("isTransformsMainRoute", () => {
    it.each`
      pathname                                     | expected
      ${"/data-studio/transforms"}                 | ${true}
      ${"/data-studio/transforms/123"}             | ${true}
      ${"/data-studio/transforms/new/query"}       | ${true}
      ${"/data-studio/transforms/jobs"}            | ${false}
      ${"/data-studio/transforms/jobs/123"}        | ${false}
      ${"/data-studio/transforms/runs"}            | ${false}
      ${"/data-studio/transforms/runs/individual"} | ${false}
      ${"/data-studio/library"}                    | ${false}
    `("returns $expected for $pathname", ({ pathname, expected }) => {
      expect(isTransformsMainRoute(pathname)).toBe(expected);
    });
  });

  describe("isTransformsRunsRoute", () => {
    // Both the grouped (/runs) and detailed (/runs/individual) views keep the
    // Runs tab selected.
    it.each`
      pathname                                            | expected
      ${"/data-studio/transforms/runs"}                   | ${true}
      ${"/data-studio/transforms/runs?page=2"}            | ${true}
      ${"/data-studio/transforms/runs/individual"}        | ${true}
      ${"/data-studio/transforms/runs/individual?page=2"} | ${true}
      ${"/data-studio/transforms"}                        | ${false}
      ${"/data-studio/transforms/jobs"}                   | ${false}
    `("returns $expected for $pathname", ({ pathname, expected }) => {
      expect(isTransformsRunsRoute(pathname)).toBe(expected);
    });
  });

  describe("isTransformsJobsRoute", () => {
    it.each`
      pathname                              | expected
      ${"/data-studio/transforms/jobs"}     | ${true}
      ${"/data-studio/transforms/jobs/123"} | ${true}
      ${"/data-studio/transforms/runs"}     | ${false}
      ${"/data-studio/transforms"}          | ${false}
    `("returns $expected for $pathname", ({ pathname, expected }) => {
      expect(isTransformsJobsRoute(pathname)).toBe(expected);
    });
  });
});
