import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders } from "__support__/ui";
import type * as IframeUtils from "metabase/utils/iframe";
import { isWithinIframe } from "metabase/utils/iframe";

import { useMetabotEnabledEmbeddingAware } from "./use-metabot-embedding-aware-enabled";

jest.mock("metabase/utils/iframe", () => ({
  ...jest.requireActual<typeof IframeUtils>("metabase/utils/iframe"),
  isWithinIframe: jest.fn(),
}));

interface SetupOpts {
  isEmbedded: boolean;
  isMetabotEnabled: boolean;
  isEmbeddedMetabotEnabled: boolean;
}

const setup = ({
  isEmbedded,
  isMetabotEnabled,
  isEmbeddedMetabotEnabled,
}: SetupOpts) => {
  jest.mocked(isWithinIframe).mockReturnValue(isEmbedded);

  const { result } = renderHookWithProviders(
    () => useMetabotEnabledEmbeddingAware(),
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "metabot-enabled?": isMetabotEnabled,
          "embedded-metabot-enabled?": isEmbeddedMetabotEnabled,
          "llm-metabot-configured?": true,
        }),
      }),
    },
  );

  return result.current;
};

describe("useMetabotEnabledEmbeddingAware", () => {
  it.each([
    { isEmbeddedMetabotEnabled: true, isMetabotEnabled: false },
    { isEmbeddedMetabotEnabled: false, isMetabotEnabled: true },
  ])(
    "follows embedded-metabot-enabled? = $isEmbeddedMetabotEnabled in an iframe",
    ({ isEmbeddedMetabotEnabled, isMetabotEnabled }) => {
      expect(
        setup({ isEmbedded: true, isMetabotEnabled, isEmbeddedMetabotEnabled }),
      ).toBe(isEmbeddedMetabotEnabled);
    },
  );

  it.each([
    { isMetabotEnabled: true, isEmbeddedMetabotEnabled: false },
    { isMetabotEnabled: false, isEmbeddedMetabotEnabled: true },
  ])(
    "follows metabot-enabled? = $isMetabotEnabled outside an iframe",
    ({ isMetabotEnabled, isEmbeddedMetabotEnabled }) => {
      expect(
        setup({
          isEmbedded: false,
          isMetabotEnabled,
          isEmbeddedMetabotEnabled,
        }),
      ).toBe(isMetabotEnabled);
    },
  );
});
