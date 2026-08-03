import { getCustomVizPluginWarningMessage } from "./warning-messages";

describe("getCustomVizPluginWarningMessage", () => {
  it("describes a stamped SDK version outside the tested range", () => {
    expect(
      getCustomVizPluginWarningMessage({
        type: "sdk-version-mismatch",
        sdk_version: "3.1.0",
        tested_sdk_range: "2.0",
      }),
    ).toBe(
      "Built with SDK version 3.1.0, but this version of Metabase was tested with SDK 2.0.",
    );
  });

  it("describes an unstamped bundle as SDK 1.x", () => {
    expect(
      getCustomVizPluginWarningMessage({
        type: "sdk-version-mismatch",
        sdk_version: null,
        tested_sdk_range: "2.0",
      }),
    ).toBe(
      "Built with SDK version 1.x, but this version of Metabase was tested with SDK 2.0.",
    );
  });

  it("describes an unsatisfied metabase.version range", () => {
    expect(
      getCustomVizPluginWarningMessage({
        type: "metabase-version-mismatch",
        metabase_version: ">=1.99",
        current_version: "v1.64.0",
      }),
    ).toBe("Requires Metabase >=1.99, but this instance is on v1.64.0.");
  });
});
