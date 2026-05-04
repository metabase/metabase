import { createMockWorkspace } from "metabase-types/api/mocks";

import { filterWorkspaces } from "./utils";

describe("filterWorkspaces", () => {
  const acme = createMockWorkspace({ id: 1, name: "Acme analytics" });
  const beta = createMockWorkspace({ id: 2, name: "Beta sandbox" });
  const empty = createMockWorkspace({ id: 3, name: "" });

  it("returns the original list when the query is empty", () => {
    expect(filterWorkspaces([acme, beta], "")).toEqual([acme, beta]);
  });

  it("filters by case-insensitive substring match on name", () => {
    expect(filterWorkspaces([acme, beta], "ACME")).toEqual([acme]);
    expect(filterWorkspaces([acme, beta], "sandbox")).toEqual([beta]);
  });

  it("returns no matches when nothing contains the query", () => {
    expect(filterWorkspaces([acme, beta], "zzz")).toEqual([]);
  });

  it("does not crash on workspaces with empty names", () => {
    expect(filterWorkspaces([acme, empty], "acme")).toEqual([acme]);
  });
});
