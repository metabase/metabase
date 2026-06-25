import type { Location } from "history";

import { createMockState } from "metabase/redux/store/mocks";
import type { RouterProps } from "metabase/selectors/app";
import { createMockUser } from "metabase-types/api/mocks";

import {
  getIsAppBarVisible,
  getIsCollectionPathVisible,
  getIsMonitorApp,
  getIsNavBarEnabled,
} from "./selectors";

const createLocation = (pathname: string): Location =>
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

describe("Monitor space shell", () => {
  const stateWithUser = () =>
    createMockState({ currentUser: createMockUser() });

  it("getIsMonitorApp is true under /monitor and false elsewhere", () => {
    const state = stateWithUser();

    expect(getIsMonitorApp(state, createRouterProps("/monitor"))).toBe(true);
    expect(
      getIsMonitorApp(
        state,
        createRouterProps("/monitor/dependency-diagnostics"),
      ),
    ).toBe(true);
    expect(getIsMonitorApp(state, createRouterProps("/browse/databases"))).toBe(
      false,
    );
  });

  it("hides the navbar and app bar within Monitor, like Data Studio", () => {
    const state = stateWithUser();

    expect(getIsNavBarEnabled(state, createRouterProps("/monitor"))).toBe(
      false,
    );
    expect(getIsAppBarVisible(state, createRouterProps("/monitor"))).toBe(
      false,
    );
  });

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
