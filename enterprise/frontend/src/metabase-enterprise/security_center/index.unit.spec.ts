import { PLUGIN_SECURITY_CENTER, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SecurityCenterNavItem } from "./components/SecurityCenterNavItem/SecurityCenterNavItem";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = jest.mocked(hasPremiumFeature);

describe("metabase-enterprise/security_center initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("leaves the OSS defaults when admin_security_center is absent", () => {
    mockHasPremiumFeature.mockReturnValue(false);

    initializePlugin();

    expect(PLUGIN_SECURITY_CENTER.isEnabled).toBe(false);
    expect(PLUGIN_SECURITY_CENTER.SecurityCenterNavItem).not.toBe(
      SecurityCenterNavItem,
    );
  });

  it("registers the page and the nav item when admin_security_center is present", () => {
    mockHasPremiumFeature.mockImplementation(
      (feature) => feature === "admin_security_center",
    );

    initializePlugin();

    expect(PLUGIN_SECURITY_CENTER.isEnabled).toBe(true);
    expect(PLUGIN_SECURITY_CENTER.SecurityCenterNavItem).toBe(
      SecurityCenterNavItem,
    );
  });
});
