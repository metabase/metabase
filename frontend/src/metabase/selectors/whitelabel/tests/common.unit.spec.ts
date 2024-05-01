import {
  getApplicationName,
  getIsWhiteLabeling,
  getShowMetabaseLinks,
  getWhiteLabeledLoadingMessageFactory,
  getCanWhitelabel,
} from "..";

import { setup } from "./setup";

describe("getWhiteLabeledLoadingMessage (OSS)", () => {
  it("should return 'Doing science...' when loading-message is set to 'doing-science'", () => {
    const { getState } = setup({ loadingMessage: "doing-science" });

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Doing science...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Waiting for results...",
    );
  });

  it("should return 'Doing science...' when loading-message is set to 'loading-results'", () => {
    const { getState } = setup({ loadingMessage: "loading-results" });

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Doing science...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Waiting for results...",
    );
  });

  it("should return 'Doing science...' when loading-message is set to 'running-query'", () => {
    const { getState } = setup({ loadingMessage: "running-query" });

    expect(getWhiteLabeledLoadingMessageFactory(getState())(false)).toBe(
      "Doing science...",
    );
    expect(getWhiteLabeledLoadingMessageFactory(getState())(true)).toBe(
      "Waiting for results...",
    );
  });
});

describe("getIsWhiteLabeling (OSS)", () => {
  it("should return false when application-name is unchanged", () => {
    const { getState } = setup();

    expect(getIsWhiteLabeling(getState())).toBe(false);
  });

  it("should return false when application-name is changed", () => {
    const { getState } = setup({ applicationName: "something else" });

    expect(getIsWhiteLabeling(getState())).toBe(false);
  });
});

describe("getApplicationName (OSS)", () => {
  it("should return Metabase when application-name is unchanged", () => {
    const { getState } = setup();

    expect(getApplicationName(getState())).toBe("Metabase");
  });

  it("should return Metabase when application-name is changed", () => {
    const { getState } = setup({ applicationName: "something else" });

    expect(getApplicationName(getState())).toBe("Metabase");
  });
});

describe("getCanWhitelabel (OSS)", () => {
  it("should return false", () => {
    const { getState } = setup();

    expect(getCanWhitelabel(getState())).toBe(false);
  });
});

describe("getShowMetabaseLinks (OSS)", () => {
  it("should return true when show-metabase-links is true", () => {
    const { getState } = setup({ showMetabaseLinks: true });

    expect(getShowMetabaseLinks(getState())).toBe(true);
  });

  it("should return true when show-metabase-links is false", () => {
    const { getState } = setup({ showMetabaseLinks: false });

    expect(getShowMetabaseLinks(getState())).toBe(true);
  });
});
