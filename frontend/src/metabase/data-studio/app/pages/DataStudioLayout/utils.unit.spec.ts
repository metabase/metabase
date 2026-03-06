import { getCurrentTab } from "./utils";

describe("getCurrentTab", () => {
  it.each`
    pathname                                              | expectedTab
    ${"/data-studio/glossary"}                            | ${"glossary"}
    ${"/data-studio/glossary/some-path"}                  | ${"glossary"}
    ${"/data-studio/transforms/jobs"}                     | ${"jobs"}
    ${"/data-studio/transforms/jobs/123"}                 | ${"jobs"}
    ${"/data-studio/transforms/jobs/new"}                 | ${"jobs"}
    ${"/data-studio/dependencies"}                        | ${"dependencies"}
    ${"/data-studio/dependencies?id=1&type=card"}         | ${"dependencies"}
    ${"/data-studio/dependency-diagnostics"}              | ${"dependency-diagnostics"}
    ${"/data-studio/dependency-diagnostics/breaking"}     | ${"dependency-diagnostics"}
    ${"/data-studio/dependency-diagnostics/unreferenced"} | ${"dependency-diagnostics"}
    ${"/data-studio/library"}                             | ${"library"}
    ${"/data-studio/library/collections/123"}             | ${"library"}
    ${"/data-studio/library/metrics/456"}                 | ${"library"}
    ${"/data-studio/transforms/runs"}                     | ${"runs"}
    ${"/data-studio/transforms/runs?page=2"}              | ${"runs"}
    ${"/data-studio/transforms"}                          | ${"transforms"}
    ${"/data-studio/transforms/123"}                      | ${"transforms"}
    ${"/data-studio/transforms/new/query"}                | ${"transforms"}
    ${"/data-studio/data"}                                | ${"data"}
    ${"/data-studio/data/database/1"}                     | ${"data"}
    ${"/data-studio"}                                     | ${"data"}
  `(
    "should return '$expectedTab' for pathname '$pathname'",
    ({ pathname, expectedTab }) => {
      expect(getCurrentTab(pathname)).toBe(expectedTab);
    },
  );
});
