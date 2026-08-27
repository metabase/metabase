import { DATA_APP_EXTERNALS, DATA_APP_GLOBALS } from "./bundle";

describe("data-app bundle externals", () => {
  it("externalizes React DOM imports to endowed globals", () => {
    expect(DATA_APP_GLOBALS).toEqual(
      expect.objectContaining({
        "react-dom": "__react_dom__",
        "react-dom/client": "__react_dom_client__",
        "react-dom/server": "__react_dom_server__",
      }),
    );
    expect(DATA_APP_EXTERNALS).toEqual(
      expect.arrayContaining([
        "react-dom",
        "react-dom/client",
        "react-dom/server",
      ]),
    );
  });
});
