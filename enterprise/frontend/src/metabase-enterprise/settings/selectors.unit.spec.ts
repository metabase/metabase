import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { getHasCustomColors, getLoadingMessage, getLogoUrl } from "./selectors";

describe("getHasCustomColors", () => {
  it('should return `true` if "application-colors" has values', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "application-colors": {
          brand: "#123456",
        },
      }),
    });

    expect(getHasCustomColors(states)).toBe(true);
  });

  it('should return `false` if "application-colors" has no values', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "application-colors": {},
      }),
    });

    expect(getHasCustomColors(states)).toBe(false);
  });

  it('should return `false` if "application-colors" is not set', () => {
    const states = createMockState({
      settings: createMockSettingsState(),
    });

    expect(getHasCustomColors(states)).toBe(false);
  });
});

describe("getLogoUrl", () => {
  it('should return default logo url if "application-logo-url" is not set', () => {
    const states = createMockState({
      settings: createMockSettingsState(),
    });

    const expectedDefaultLogoUrl = "app/assets/img/logo.svg";

    expect(getLogoUrl(states)).toBe(expectedDefaultLogoUrl);
  });

  it('should return default logo url if "application-logo-url" has no values', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "application-logo-url": undefined,
      }),
    });

    const expectedDefaultLogoUrl = "app/assets/img/logo.svg";

    expect(getLogoUrl(states)).toBe(expectedDefaultLogoUrl);
  });

  it('should return custom logo url if "application-logo-url" is set', () => {
    const customLogoDataUrl = "data:image/png;base64,aaaaaaaaaaaaaaaaaaaaaa";
    const states = createMockState({
      settings: createMockSettingsState({
        "application-logo-url": customLogoDataUrl,
      }),
    });

    expect(getLogoUrl(states)).toBe(customLogoDataUrl);
  });
});

describe("getLoadingMessage", () => {
  it('should show correct loading message when "loading-message" is set to "doing-science"', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "loading-message": "doing-science",
      }),
    });

    const expectedLoadingMessage = "Doing science...";

    expect(getLoadingMessage(states)).toBe(expectedLoadingMessage);
  });

  it('should show correct loading message when "loading-message" is set to "running-query"', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "loading-message": "loading-results",
      }),
    });

    const expectedLoadingMessage = "Loading results...";
    ("");

    expect(getLoadingMessage(states)).toBe(expectedLoadingMessage);
  });

  it('should show correct loading message when "loading-message" is set to "loading-results"', () => {
    const states = createMockState({
      settings: createMockSettingsState({
        "loading-message": "running-query",
      }),
    });

    const expectedLoadingMessage = "Running query...";

    expect(getLoadingMessage(states)).toBe(expectedLoadingMessage);
  });
});
