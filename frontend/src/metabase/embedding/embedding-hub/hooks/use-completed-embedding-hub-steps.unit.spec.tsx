import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import type { EnterpriseSettings, SettingKey } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import type { EmbeddingHubStepId } from "../types";

import { useCompletedEmbeddingHubSteps } from "./use-completed-embedding-hub-steps";

const setup = (settings: Partial<EnterpriseSettings> = {}) => {
  const state = createMockState({
    settings: mockSettings(settings),
  });

  return renderHookWithProviders(() => useCompletedEmbeddingHubSteps(), {
    storeInitialState: state,
  });
};

describe("useCompletedEmbeddingHubSteps", () => {
  describe("mark secure-embeds step to be true if either JWT or SAML is enabled and configured", () => {
    const secureEmbedsTestCases = [
      [{ "jwt-enabled": true, "jwt-configured": true }, true],
      [{ "jwt-enabled": true }, false],
      [{ "saml-enabled": true, "saml-configured": true }, true],
      [{ "saml-enabled": true }, false],
      [
        {
          "jwt-enabled": true,
          "jwt-configured": true,
          "saml-enabled": true,
          "saml-configured": true,
        },
        true,
      ],
      [{ "jwt-enabled": true, "saml-enabled": true }, false],
      [{}, false],
    ] as const satisfies [Partial<EnterpriseSettings>, boolean][];

    it.each(secureEmbedsTestCases)(
      "config %j should return %p",
      (settings, expected) => {
        const { result } = setup(settings);

        expect(result.current["secure-embeds"]).toBe(expected);
      },
    );
  });

  const stepCompletionTestCases = [
    {
      stepId: "create-test-embed",
      settingKey: "embedding-hub-test-embed-snippet-created",
    },
    {
      stepId: "embed-production",
      settingKey: "embedding-hub-production-embed-snippet-created",
    },
  ] satisfies { stepId: EmbeddingHubStepId; settingKey: SettingKey }[];

  stepCompletionTestCases.forEach(({ stepId, settingKey }) => {
    describe(`${stepId} step completion should depend on setting`, () => {
      it.each([
        [{ [settingKey]: true }, true],
        [{ [settingKey]: false }, false],
        [{}, false],
      ])("settings %j should return %p", (settings, expected) => {
        const { result } = setup(settings);

        expect(result.current[stepId]).toBe(expected);
      });
    });
  });
});
