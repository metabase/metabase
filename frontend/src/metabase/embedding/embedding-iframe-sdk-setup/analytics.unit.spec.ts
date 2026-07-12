import type { EmbeddingParameters } from "metabase-types/api";

import { trackEmbedWizardOptionsCompleted } from "./analytics";
import type { SdkIframeEmbedSetupSettings } from "./types";
import { getDefaultSdkIframeEmbedSettings } from "./utils/get-default-sdk-iframe-embed-setting";

jest.mock("metabase/analytics", () => ({
  trackSimpleEvent: jest.fn(),
}));

jest.mock("./utils/get-common-embed-settings", () => ({
  getCommonEmbedSettings: jest.fn(() => ({ isGuest: false })),
}));

const { trackSimpleEvent: trackSimpleEventMock } =
  jest.requireMock("metabase/analytics");

const BASE_PARAMS = {
  initialState: undefined,
  resource: null,
  isSimpleEmbedFeatureAvailable: true,
  isGuestEmbedsEnabled: false,
  isSsoEnabledAndConfigured: true,
  embeddingParameters: {} as EmbeddingParameters,
} as const;

describe("trackEmbedWizardOptionsCompleted", () => {
  beforeEach(() => {
    trackSimpleEventMock.mockClear();
  });

  it("reports settings=default for an unmodified chart carrying initialSqlParameters (metabase#68285)", () => {
    const experience = "chart" as const;

    // The live wizard settings for a chart carry `initialSqlParameters` even
    // when the user hasn't customized anything. The tracker recomputes the
    // experience defaults to compare against; unless those defaults also carry
    // `initialSqlParameters`, an untouched chart is misreported as customized.
    const settings: SdkIframeEmbedSetupSettings = {
      ...getDefaultSdkIframeEmbedSettings({
        experience,
        resourceId: 0,
        isSimpleEmbedFeatureAvailable:
          BASE_PARAMS.isSimpleEmbedFeatureAvailable,
        isGuestEmbedsEnabled: BASE_PARAMS.isGuestEmbedsEnabled,
        isSsoEnabledAndConfigured: BASE_PARAMS.isSsoEnabledAndConfigured,
        isGuest: false,
        useExistingUserSession: false,
      }),
      initialSqlParameters: {},
    };

    trackEmbedWizardOptionsCompleted({ ...BASE_PARAMS, experience, settings });

    expect(trackSimpleEventMock).toHaveBeenCalledWith({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });
});
