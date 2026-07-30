import {
  getAdminSettingsMetabotContext,
  getAdminSettingsSectionLabel,
} from "./use-register-admin-settings-metabot-context";

describe("getAdminSettingsSectionLabel", () => {
  it.each([
    ["/admin/settings/general", "General"],
    ["/admin/settings/authentication", "Authentication"],
    ["/admin/settings/authentication/google", "Google auth"],
    ["/admin/settings/authentication/ldap", "LDAP"],
    ["/admin/settings/whitelabel/branding", "Branding"],
    ["/admin/settings/public-sharing", "Public sharing"],
    ["/admin/settings/apps", "Data apps"],
    ["/admin/settings/cloud", "Cloud"],
  ])("maps %s to %s", (pathname, label) => {
    expect(getAdminSettingsSectionLabel(pathname)).toBe(label);
  });

  it("falls back to the closest parent section for nested paths", () => {
    expect(
      getAdminSettingsSectionLabel("/admin/settings/custom-visualizations/new"),
    ).toBe("Custom visualizations");
    expect(
      getAdminSettingsSectionLabel(
        "/admin/settings/custom-visualizations/edit/1",
      ),
    ).toBe("Custom visualizations");
  });

  it("returns undefined for unknown settings sections", () => {
    expect(
      getAdminSettingsSectionLabel("/admin/settings/unknown-section"),
    ).toBeUndefined();
  });

  it("returns undefined outside of admin settings", () => {
    expect(getAdminSettingsSectionLabel("/admin/people")).toBeUndefined();
    expect(getAdminSettingsSectionLabel("/dashboard/1")).toBeUndefined();
  });
});

describe("getAdminSettingsMetabotContext", () => {
  it("returns an admin_settings entry for a settings page", () => {
    expect(
      getAdminSettingsMetabotContext("/admin/settings/authentication/google"),
    ).toEqual({
      user_is_viewing: [
        {
          type: "admin_settings",
          section: "Google auth",
          path: "/admin/settings/authentication/google",
        },
      ],
    });
  });

  it("returns empty context outside of admin settings", () => {
    expect(getAdminSettingsMetabotContext("/admin/tools/errors")).toEqual({});
  });

  it("returns empty context for unmapped settings paths", () => {
    expect(getAdminSettingsMetabotContext("/admin/settings/nope")).toEqual({});
  });
});
