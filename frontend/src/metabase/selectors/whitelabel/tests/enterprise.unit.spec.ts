import { getIsWhiteLabeling, getWhiteLabeledLoadingMessage } from "..";
import { SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("getWhiteLabeledLoadingMessage (EE without token)", () => {
  it("should return 'Doing science...' when loading-message is set to 'doing-science'", () => {
    const { getState } = setup({ loadingMessage: "doing-science" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe("Doing science...");
  });

  it("should return 'Doing science...' when loading-message is set to 'loading-results'", () => {
    const { getState } = setup({ loadingMessage: "loading-results" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe("Doing science...");
  });

  it("should return 'Doing science...' when loading-message is set to 'running-query'", () => {
    const { getState } = setup({ loadingMessage: "running-query" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe("Doing science...");
  });
});

describe("getIsWhiteLabeling (EE without token)", () => {
  it("should return false when application-name is unchanged", () => {
    const { getState } = setup();

    expect(getIsWhiteLabeling(getState())).toBe(false);
  });

  it("should return false when application-name is changed", () => {
    const { getState } = setup({ applicationName: "something else" });

    expect(getIsWhiteLabeling(getState())).toBe(false);
  });
});
