import { getWhiteLabeledLoadingMessage } from "..";
import { SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("getWhiteLabeledLoadingMessage (EE with token)", () => {
  it("should return 'Doing science...' when loading-message is set to 'doing-science'", () => {
    const { getState } = setup({ loadingMessage: "doing-science" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe("Doing science...");
  });

  it("should return 'Loading results...' when loading-message is set to 'loading-results'", () => {
    const { getState } = setup({ loadingMessage: "loading-results" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe(
      "Loading results...",
    );
  });

  it("should return 'Running query...' when loading-message is set to 'running-query'", () => {
    const { getState } = setup({ loadingMessage: "running-query" });

    expect(getWhiteLabeledLoadingMessage(getState())).toBe("Running query...");
  });
});
