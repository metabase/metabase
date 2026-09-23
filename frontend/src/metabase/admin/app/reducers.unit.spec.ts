import { getAdminPaths } from "./reducers";

describe("getAdminPaths", () => {
  // The order is load-bearing: AdminNavbar binds the digits 1-9 to
  // `adminPaths[key - 1]`, so inserting or reordering an entry silently
  // re-points a keyboard shortcut at a different page.
  it("keeps the tab order the digit shortcuts are bound to", () => {
    expect(getAdminPaths().map(({ key }) => key)).toEqual([
      "settings",
      "databases",
      "embedding",
      "metabot",
      "data-model",
      "people",
      "permissions",
      "performance",
      "help",
    ]);
  });
});
