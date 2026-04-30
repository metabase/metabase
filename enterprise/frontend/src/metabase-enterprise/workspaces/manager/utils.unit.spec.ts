import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { getAvailableDatabases, supportsWorkspaces } from "./utils";

describe("supportsWorkspaces", () => {
  it("returns true when the database advertises the workspace feature", () => {
    const database = createMockDatabase({ features: ["workspace"] });
    expect(supportsWorkspaces(database)).toBe(true);
  });

  it("returns false when the database does not advertise the workspace feature", () => {
    const database = createMockDatabase({ features: [] });
    expect(supportsWorkspaces(database)).toBe(false);
  });

  it("returns false when features is undefined", () => {
    const database = createMockDatabase({ features: undefined });
    expect(supportsWorkspaces(database)).toBe(false);
  });
});

describe("getAvailableDatabases", () => {
  const supported1 = createMockDatabase({
    id: 1,
    name: "Postgres prod",
    features: ["workspace"],
  });
  const supported2 = createMockDatabase({
    id: 2,
    name: "Postgres staging",
    features: ["workspace"],
  });
  const unsupported = createMockDatabase({
    id: 3,
    name: "MySQL legacy",
    features: [],
  });

  it("returns only databases advertising the workspace feature", () => {
    expect(
      getAvailableDatabases([supported1, supported2, unsupported], []),
    ).toEqual([supported1, supported2]);
  });

  it("excludes already-configured databases", () => {
    expect(
      getAvailableDatabases(
        [supported1, supported2],
        [createMockWorkspaceDatabase({ database_id: 1 })],
      ),
    ).toEqual([supported2]);
  });

  it("keeps the currently-selected database even when it is already configured (edit mode)", () => {
    expect(
      getAvailableDatabases(
        [supported1, supported2],
        [
          createMockWorkspaceDatabase({ database_id: 1 }),
          createMockWorkspaceDatabase({ database_id: 2 }),
        ],
        1,
      ),
    ).toEqual([supported1]);
  });
});
