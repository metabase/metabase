import { act } from "@testing-library/react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { TokenStatus } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

// Tests fail without this mock, even with jest.useFakeTimers()
// Probably same/similar issue https://github.com/jestjs/jest/issues/3465
jest.mock("underscore", () => {
  const original = jest.requireActual("underscore");
  return {
    ...original,
    debounce: jest.fn((fn) => fn),
  };
});

const SETTINGS_ENDPOINT =
  "/api/setting/license-token-missing-banner-dismissal-timestamp";

import {
  shouldShowBanner,
  useLicenseTokenMissingBanner,
} from "./useLicenseTokenMissingBanner";

describe("shouldShowBanner works correctly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-03-20T00:00:00.000Z"));
  });

  it("should return false when not running EE build", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: [],
      isEEBuild: false,
      isAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should return false when token status is not null", () => {
    const result = shouldShowBanner({
      tokenStatus: {
        status: "valid",
        valid: true,
      },
      lastDismissed: [],
      isEEBuild: true,
      isAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should return false when banner has been dismissed twice", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-19T00:00:00.000Z", "2024-03-20T00:00:00.000Z"],
      isEEBuild: true,
      isAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should return true when banner has never been dismissed", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: [],
      isEEBuild: true,
      isAdmin: true,
    });

    expect(result).toBe(true);
  });

  it("should return false when banner was dismissed less than 14 days ago", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-10T00:00:00.000Z"],
      isEEBuild: true,
      isAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should return true when banner was dismissed more than 14 days ago", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-01T00:00:00.000Z"],
      isEEBuild: true,
      isAdmin: true,
    });

    expect(result).toBe(true);
  });

  it("should return false when not admin", () => {
    const result = shouldShowBanner({
      tokenStatus: null,
      lastDismissed: ["2024-03-01T00:00:00.000Z"],
      isEEBuild: true,
      isAdmin: false,
    });

    expect(result).toBe(false);
  });
});

describe("useLicenseTokenMissingBanner", () => {
  const NOW = new Date("2024-03-20T00:00:00.000Z");

  const setup = ({
    tokenStatus,
    dismissals,
    isAdmin,
  }: {
    tokenStatus?: TokenStatus;
    dismissals?: string[];
    isAdmin?: boolean;
  } = {}) => {
    const state = createMockState({
      settings: mockSettings({
        "license-token-missing-banner-dismissal-timestamp": dismissals ?? [],
        "token-status": tokenStatus ?? null,
      }),
    });
    setupEnterprisePlugins();
    setupUpdateSettingEndpoint();
    setupSettingsEndpoints([
      {
        key: "license-token-missing-banner-dismissal-timestamp",
        value: dismissals ?? [],
      },
    ]);
    setupPropertiesEndpoints(
      createMockSettings({
        "license-token-missing-banner-dismissal-timestamp": dismissals ?? [],
        "token-status": tokenStatus ?? null,
      }),
    );
    return renderHookWithProviders(
      () => useLicenseTokenMissingBanner(isAdmin ?? true),
      {
        storeInitialState: state,
      },
    );
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  describe("shouldShow", () => {
    it("is true when conditions are met", () => {
      const { result } = setup();

      expect(result.current.shouldShowLicenseTokenMissingBanner).toBe(true);
    });

    it("is false when token status is valid", () => {
      const { result } = setup({
        tokenStatus: { status: "valid", valid: true },
      });

      expect(result.current.shouldShowLicenseTokenMissingBanner).toBe(false);
    });
  });

  describe("dismissBanner", () => {
    it("updates lastDismissed", async () => {
      const { result } = setup();

      expect(result.current.shouldShowLicenseTokenMissingBanner).toBe(true);

      act(() => {
        result.current.dismissBanner();
      });
      await waitFor(async () => {
        const [{ url }] = await findRequests("PUT");
        expect(url).toContain(SETTINGS_ENDPOINT);
      });
    });

    it("keeps only last 2 dismissals", async () => {
      const FIRST_DISMISSAL = new Date("2024-03-18T00:00:00.000Z");
      const SECOND_DISMISSAL = new Date("2024-03-19T00:00:00.000Z");
      const existingDismissals = [
        FIRST_DISMISSAL.toISOString(),
        SECOND_DISMISSAL.toISOString(),
      ];

      const { result } = setup({ dismissals: existingDismissals });

      await waitFor(() => {
        expect(result.current.shouldShowLicenseTokenMissingBanner).toBe(false);
      });

      act(() => {
        result.current.dismissBanner();
      });

      let dismissalTimestamp;

      await waitFor(async () => {
        const [{ url, body }] = await findRequests("PUT");
        expect(url).toContain(SETTINGS_ENDPOINT);
        dismissalTimestamp = body.value[1];
      });

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [{ url, body }] = puts;
      expect(url).toContain(SETTINGS_ENDPOINT);
      expect(body).toEqual({
        value: [SECOND_DISMISSAL.toISOString(), dismissalTimestamp],
      });
    });
  });
});
