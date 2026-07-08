import type { Location } from "history";

import { createMockState } from "metabase/redux/store/mocks";
import type { RouterProps } from "metabase/selectors/app";

import { getIsCollectionPathVisible } from "./selectors";

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
