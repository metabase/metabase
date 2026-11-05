import {
  createMockAdminAppState,
  createMockAdminState,
  createMockState,
} from "__support__/state";
import type { AdminPath } from "metabase/redux/store";

import { getHasAdminPath } from "./admin";

const DATABASES_PATH: AdminPath = {
  key: "databases",
  getName: () => "Databases",
  path: "/admin/databases",
};

const setup = (paths: AdminPath[]) =>
  createMockState({
    admin: createMockAdminState({
      app: createMockAdminAppState({ paths }),
    }),
  });

describe("getHasAdminPath", () => {
  it("returns true when the user has the admin path", () => {
    const state = setup([DATABASES_PATH]);

    expect(getHasAdminPath(state, "databases")).toBe(true);
  });

  it("returns false when the user lacks the admin path", () => {
    const state = setup([DATABASES_PATH]);

    expect(getHasAdminPath(state, "data-model")).toBe(false);
  });

  it("returns false when the user has no admin paths", () => {
    const state = setup([]);

    expect(getHasAdminPath(state, "databases")).toBe(false);
  });
});
