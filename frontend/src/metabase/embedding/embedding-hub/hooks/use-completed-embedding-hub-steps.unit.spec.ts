import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import type { SettingKey } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import type { EmbeddingHubStepId } from "../types";

import { useCompletedEmbeddingHubSteps } from "./use-completed-embedding-hub-steps";

const setup = (settingsOverride = {}) => {
  const state = createMockState({
    settings: mockSettings(settingsOverride),
  });

  return renderHookWithProviders(() => useCompletedEmbeddingHubSteps(), {
    storeInitialState: state,
  });
};

describe("useCompletedEmbeddingHubSteps", () => {
  const testCases = [
    {
      stepId: "create-test-embed",
      settingKey: "embedding-hub-test-embed-snippet-created",
    },
    {
      stepId: "embed-production",
      settingKey: "embedding-hub-production-embed-snippet-created",
    },
  ] satisfies { stepId: EmbeddingHubStepId; settingKey: SettingKey }[];

  testCases.forEach(({ stepId, settingKey }) => {
    describe(`${stepId} step completion should depend on setting`, () => {
      it.each([
        [{ [settingKey]: true }, true],
        [{ [settingKey]: false }, false],
        [{}, false],
      ])("config %j should return %p", (config, expected) => {
        const { result } = setup(config);

        expect(result.current[stepId]).toBe(expected);
      });
    });
  });
});
