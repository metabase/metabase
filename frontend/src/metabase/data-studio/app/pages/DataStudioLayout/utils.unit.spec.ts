import { getCurrentTab } from "./utils";

describe("getCurrentTab", () => {
  it.each`
    pathname                                       | expectedTab
    ${"/data-studio/guide"}                        | ${"guide"}
    ${"/data-studio/glossary"}                     | ${"glossary"}
    ${"/data-studio/glossary/some-path"}           | ${"glossary"}
    ${"/data-studio/transforms/jobs"}              | ${"transforms"}
    ${"/data-studio/transforms/jobs/123"}          | ${"transforms"}
    ${"/data-studio/transforms/jobs/new"}          | ${"transforms"}
    ${"/data-studio/dependencies"}                 | ${"dependencies"}
    ${"/data-studio/dependencies?id=1&type=card"}  | ${"dependencies"}
    ${"/data-studio/library"}                      | ${"library"}
    ${"/data-studio/library/collections/123"}      | ${"library"}
    ${"/data-studio/library/metrics/456"}          | ${"library"}
    ${"/data-studio/library/metrics/456/overview"} | ${"library"}
    ${"/data-studio/library/tables/42"}            | ${"library"}
    ${"/data-studio/transforms/runs"}              | ${"transforms"}
    ${"/data-studio/transforms/runs?page=2"}       | ${"transforms"}
    ${"/data-studio/transforms"}                   | ${"transforms"}
    ${"/data-studio/transforms/123"}               | ${"transforms"}
    ${"/data-studio/transforms/new/query"}         | ${"transforms"}
    ${"/data-studio/data"}                         | ${"data"}
    ${"/data-studio/data/database/1"}              | ${"data"}
    ${"/data-studio/schema-viewer"}                | ${"schema-viewer"}
    ${"/data-studio"}                              | ${"guide"}
    ${"/data-studio/settings"}                     | ${"settings"}
  `(
    "should return '$expectedTab' for pathname '$pathname'",
    ({ pathname, expectedTab }) => {
      expect(getCurrentTab(pathname)).toBe(expectedTab);
    },
  );
});
