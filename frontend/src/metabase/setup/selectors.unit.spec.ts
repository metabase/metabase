import { mockSettings } from "__support__/settings";
import type { SetupState } from "metabase/redux/store";
import {
  createMockSetupState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { getSteps } from "./selectors";

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

describe("getSteps", () => {
  it("should include the AI config step after the database step by default", () => {
    expect(getStepKeys()).toEqual([
      "welcome",
      "user_info",
      "usage_question",
      "db_connection",
      "ai_config",
      "data_usage",
      "completed",
    ]);
  });

  it("should keep the AI config step when an AI provider is already configured", () => {
    const stepKeys = getStepKeys({
      settings: { "llm-metabot-configured?": true },
    });

    expect(stepKeys).toContain("ai_config");
  });

  it("should omit the AI config step when AI features are disabled", () => {
    const stepKeys = getStepKeys({
      settings: { "ai-features-enabled?": false },
    });

    expect(stepKeys).not.toContain("ai_config");
  });

  it("should omit the AI config step for the embedding usage reason", () => {
    const stepKeys = getStepKeys({
      setup: { usageReason: "embedding" },
    });

    expect(stepKeys).not.toContain("ai_config");
  });
});
