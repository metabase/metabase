import { mockSettings } from "__support__/settings";
import type { SetupState } from "metabase/redux/store";
import {
  createMockSetupState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { getShouldOfferAiConfig, getSteps } from "./selectors";

interface SetupOpts {
  setup?: Partial<SetupState>;
  settings?: Partial<EnterpriseSettings>;
}

const getStepKeys = ({ setup = {}, settings = {} }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState(setup),
    settings: mockSettings(createMockSettings(settings)),
  });

  return getSteps(state).map((step) => step.key);
};

const getShouldOffer = ({ setup = {}, settings = {} }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState(setup),
    settings: mockSettings(createMockSettings(settings)),
  });

  return getShouldOfferAiConfig(state);
};

describe("getSteps", () => {
  it("should omit the AI config step until it is requested", () => {
    expect(getStepKeys()).toEqual([
      "welcome",
      "user_info",
      "usage_question",
      "db_connection",
      "data_usage",
      "completed",
    ]);
  });

  it("should append the AI config step after the last step once requested", () => {
    expect(getStepKeys({ setup: { isAiConfigRequested: true } })).toEqual([
      "welcome",
      "user_info",
      "usage_question",
      "db_connection",
      "data_usage",
      "ai_config",
      "completed",
    ]);
  });

  it("should omit the requested AI config step when AI features are disabled", () => {
    const stepKeys = getStepKeys({
      setup: { isAiConfigRequested: true },
      settings: { "ai-features-enabled?": false },
    });

    expect(stepKeys).not.toContain("ai_config");
  });

  it("should omit the requested AI config step for the embedding usage reason", () => {
    const stepKeys = getStepKeys({
      setup: { isAiConfigRequested: true, usageReason: "embedding" },
    });

    expect(stepKeys).not.toContain("ai_config");
  });
});

describe("getShouldOfferAiConfig", () => {
  it("should offer the AI config step by default", () => {
    expect(getShouldOffer()).toBe(true);
  });

  it("should not offer the AI config step once it has been requested", () => {
    expect(getShouldOffer({ setup: { isAiConfigRequested: true } })).toBe(
      false,
    );
  });

  it("should not offer the AI config step when AI features are disabled", () => {
    expect(
      getShouldOffer({ settings: { "ai-features-enabled?": false } }),
    ).toBe(false);
  });

  it("should not offer the AI config step for the embedding usage reason", () => {
    expect(getShouldOffer({ setup: { usageReason: "embedding" } })).toBe(false);
  });

  it("should not offer the AI config step for the embedding use case", () => {
    expect(getShouldOffer({ setup: { isEmbeddingUseCase: true } })).toBe(false);
  });
});
