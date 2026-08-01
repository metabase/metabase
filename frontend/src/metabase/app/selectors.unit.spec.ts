import { createMockState } from "metabase/redux/store/mocks";
import type { Location } from "metabase/router";
import type { RouterProps } from "metabase/selectors/app";
import { createMockUser } from "metabase-types/api/mocks";

import {
  getIsAppBarVisible,
  getIsCollectionPathVisible,
  getIsNavBarEnabled,
} from "./selectors";

const createLocation = (pathname: string): Location =>
  // Unjustified type cast. FIXME
  ({
    pathname,
    search: "",
    hash: "",
    state: undefined,
    action: "PUSH",
    key: "",
    query: {},
  }) as unknown as Location;

const createRouterProps = (pathname: string): RouterProps => ({
  location: createLocation(pathname),
});

describe("getIsCollectionPathVisible", () => {
  it("is true on a collection page even when no question/dashboard/document is loaded", () => {
    const state = createMockState();
    const props = createRouterProps("/collection/5-foo");

    expect(getIsCollectionPathVisible(state, props)).toBe(true);
  });

  it("is true on the root collection page", () => {
    const state = createMockState();
    const props = createRouterProps("/collection/root");

    expect(getIsCollectionPathVisible(state, props)).toBe(true);
  });

  it("is false on unrelated pages like /browse", () => {
    const state = createMockState();
    const props = createRouterProps("/browse/databases");

    expect(getIsCollectionPathVisible(state, props)).toBe(false);
  });
});

describe("NavBar / AppBar visibility", () => {
  const stateWithUser = () =>
    createMockState({ currentUser: createMockUser() });

  it.each(["/monitor", "/data-studio", "/content-studio"])(
    "hides the navbar and app bar within %s",
    (path) => {
      const state = stateWithUser();

      expect(getIsNavBarEnabled(state, createRouterProps(path))).toBe(false);
      expect(getIsAppBarVisible(state, createRouterProps(path))).toBe(false);
    },
  );

  it("keeps the navbar and app bar on a regular page", () => {
    const state = stateWithUser();

    expect(
      getIsNavBarEnabled(state, createRouterProps("/browse/databases")),
    ).toBe(true);
    expect(
      getIsAppBarVisible(state, createRouterProps("/browse/databases")),
    ).toBe(true);
  });
});
