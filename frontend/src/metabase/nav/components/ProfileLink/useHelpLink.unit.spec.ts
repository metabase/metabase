import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { HelpLinkSetting } from "metabase-types/api";
import {
  createMockTokenStatus,
  createMockUser,
  createMockVersion,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useHelpLink } from "./useHelpLink";

interface SetupOptions {
  customLinkDestination?: string;
  helpLinkSetting?: HelpLinkSetting;
  isAdmin?: boolean;
  isPaidPlan?: boolean;
}

const setup = (opts?: SetupOptions) => {
  const { isPaidPlan, customLinkDestination, helpLinkSetting, isAdmin } =
    opts || {};
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: !!isAdmin }),
    settings: mockSettings({
      "token-status": isPaidPlan
        ? createMockTokenStatus({ valid: true })
        : undefined,
      version: createMockVersion({ tag: "0.2" }),
      "help-link-custom-destination": customLinkDestination || undefined,
      "help-link": helpLinkSetting,
    }),
  });
  return renderHookWithProviders(() => useHelpLink(), {
    storeInitialState,
  });
};

const defaultHelpLink =
  "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=0.2";
const premiumHelpLink =
  "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=0.2";

describe("useHelpLink", () => {
  beforeEach(() => {
    setupBugReportingDetailsEndpoint();
  });

  describe("metabase help link", () => {
    it.each`
      isAdmin  | isPaidPlan | expectedLink
      ${true}  | ${true}    | ${premiumHelpLink}
      ${true}  | ${false}   | ${defaultHelpLink}
      ${false} | ${true}    | ${defaultHelpLink}
      ${false} | ${false}   | ${defaultHelpLink}
    `(
      "should return correct link when isAdmin=$isAdmin and isPaidPlan=$isPaidPlan",
      async ({ isAdmin, isPaidPlan, expectedLink }) => {
        const { result } = setup({ isAdmin, isPaidPlan });
        await waitFor(() => {
          expect(result.current?.href).toBe(expectedLink);
        });
        expect(result.current?.visible).toBe(true);
      },
    );
  });

  it("should return visible=false when helpLinkSetting is 'hidden'", () => {
    const { result } = setup({ helpLinkSetting: "hidden" });
    expect(result.current.visible).toBe(false);
  });

  it("should return a custom link when the setting is custom", () => {
    const { result } = setup({
      customLinkDestination: "https://custom-destination.com/help",
      helpLinkSetting: "custom",
    });
    expect(result.current.href).toBe("https://custom-destination.com/help");
    expect(result.current.visible).toBe(true);
  });
});
