import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";

import { useCompletedEmbeddingHubSteps } from "./use-completed-embedding-hub-steps";

const setup = ({
  jwtEnabled = false,
  jwtConfigured = false,
  samlEnabled = false,
  samlConfigured = false,
} = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "jwt-enabled": jwtEnabled,
      "jwt-configured": jwtConfigured,
      "saml-enabled": samlEnabled,
      "saml-configured": samlConfigured,
    }),
  });

  return renderHookWithProviders(() => useCompletedEmbeddingHubSteps(), {
    storeInitialState: state,
  });
};

describe("useCompletedEmbeddingHubSteps", () => {
  describe("mark secure-embeds step to be true if either JWT or SAML is enabled and configured", () => {
    it.each([
      [{ jwtEnabled: true, jwtConfigured: true }, true],
      [{ jwtEnabled: true }, false],
      [{ samlEnabled: true, samlConfigured: true }, true],
      [{ samlEnabled: true }, false],
      [
        {
          jwtEnabled: true,
          jwtConfigured: true,
          samlEnabled: true,
          samlConfigured: true,
        },
        true,
      ],
      [{ jwtEnabled: true, samlEnabled: true }, false],
      [{}, false],
    ])("config %j should return %p", (config, expected) => {
      const { result } = setup(config);

      expect(result.current["secure-embeds"]).toBe(expected);
    });
  });
});
