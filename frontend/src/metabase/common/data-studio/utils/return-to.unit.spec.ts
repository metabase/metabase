import { getDataStudioReturnPath } from "./return-to";

const DATA_STUDIO_PATH = "/data-studio/dashboards/1";

describe("getDataStudioReturnPath", () => {
  it.each([
    [{ returnTo: DATA_STUDIO_PATH }, DATA_STUDIO_PATH],
    [{ returnTo: "/collection/1" }, undefined],
    [{ returnTo: "https://example.com/data-studio/" }, undefined],
    [{ returnTo: 1 }, undefined],
    [{}, undefined],
    [null, undefined],
    ["/data-studio/dashboards/1", undefined],
  ])("reads %j as %s", (state, expected) => {
    expect(getDataStudioReturnPath(state)).toBe(expected);
  });
});
