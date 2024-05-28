import {
  getApplicationName,
  getCanWhitelabel,
  getIsWhiteLabeling,
  getShowMetabaseLinks,
  getWhiteLabeledLoadingMessageFactory,
} from "..";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

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

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Doing science...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Waiting for results...",
    );
  });

  it("should return 'Loading results...' when loading-message is set to 'loading-results'", () => {
    const { getState } = setup({ loadingMessage: "loading-results" });

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Loading results...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Loading results...",
    );
  });

  it("should return 'Running query...' when loading-message is set to 'running-query'", () => {
    const { getState } = setup({ loadingMessage: "running-query" });

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Running query...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Running query...",
    );
  });
});

describe("getIsWhiteLabeling (EE with token)", () => {
  it("should return false when application-name is unchanged", () => {
    const { getState } = setup();

    expect(getIsWhiteLabeling(getState())).toBe(false);
  });

  it("should return true when application-name is changed", () => {
    const { getState } = setup({ applicationName: "something else" });

    expect(getIsWhiteLabeling(getState())).toBe(true);
  });
});

describe("getApplicationName (EE with token)", () => {
  it("should return Metabase when application-name is unchanged", () => {
    const { getState } = setup();

    expect(getApplicationName(getState())).toBe("Metabase");
  });

  it("should return the application when application-name is changed", () => {
    const { getState } = setup({ applicationName: "something else" });

    expect(getApplicationName(getState())).toBe("something else");
  });
});

describe("getCanWhitelabel (EE with token)", () => {
  it("should return true", () => {
    const { getState } = setup();

    expect(getCanWhitelabel(getState())).toBe(true);
  });
});

describe("getShowMetabaseLinks (EE with token)", () => {
  it("should return true when show-metabase-links is true", () => {
    const { getState } = setup({ showMetabaseLinks: true });

    expect(getShowMetabaseLinks(getState())).toBe(true);
  });

  it("should return false when show-metabase-links is false", () => {
    const { getState } = setup({ showMetabaseLinks: false });

    expect(getShowMetabaseLinks(getState())).toBe(false);
  });
});
