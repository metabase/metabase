const { getLinearIdentifiers } = require("./update-pr-with-issues");

describe("getLinearIdentifiers", () => {
  it("reads the branch prefix, title prefix, and closing keywords", () => {
    expect(
      getLinearIdentifiers({
        branch: "ghy-4651-sendmeteringevents-does-full-table-scan",
        title: "GHY-4651: `SendMeteringEvents` does full table scan",
        body: "Closes GHY-4651\nFixes: QUE-12",
      }),
    ).toEqual(["GHY-4651", "QUE-12"]);
  });

  it("ignores identifiers that are only mentioned", () => {
    expect(
      getLinearIdentifiers({
        branch: "fix-dashboard-filters",
        title: "Fix UTF-8 export (see GHY-100)",
        body: "Related to GHY-200, uses UTF-8",
      }),
    ).toEqual([]);
  });

  it("handles a missing branch and body", () => {
    expect(
      getLinearIdentifiers({ branch: undefined, title: "", body: null }),
    ).toEqual([]);
  });
});
