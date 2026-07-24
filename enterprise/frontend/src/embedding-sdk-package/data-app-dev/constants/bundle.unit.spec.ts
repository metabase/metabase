import { DATA_APP_EXTERNALS, DATA_APP_GLOBALS } from "./bundle";

describe("data-app bundle externals", () => {
  it("externalizes the SDK to endowed globals but bundles React", () => {
    expect(DATA_APP_GLOBALS).toEqual({
      "@metabase/embedding-sdk-react": "__metabase_sdk__",
      "@metabase/embedding-sdk-react/data-app": "__metabase_data_app__",
    });
    expect(DATA_APP_EXTERNALS).toEqual([
      "@metabase/embedding-sdk-react",
      "@metabase/embedding-sdk-react/data-app",
    ]);

    // React is bundled into each app (runs inside the guest realm), not external.
    expect(DATA_APP_EXTERNALS).not.toContain("react");
    expect(DATA_APP_EXTERNALS).not.toContain("react-dom");
  });
});
