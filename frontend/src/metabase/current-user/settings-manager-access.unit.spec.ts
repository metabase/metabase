import {
  getSettingsSlug,
  isSettingsManagerPath,
} from "./settings-manager-access";

describe("isSettingsManagerPath", () => {
  it.each(["", "/", "general", "general/", "whitelabel/branding"] as const)(
    "allows %j",
    (slug) => {
      expect(isSettingsManagerPath(slug)).toBe(true);
    },
  );

  it.each([
    "authentication",
    "authentication/ldap",
    "license",
    "generalized",
    "general/anything",
    undefined,
  ] as const)("rejects %j", (slug) => {
    expect(isSettingsManagerPath(slug)).toBe(false);
  });
});

describe("getSettingsSlug", () => {
  it("returns an empty slug for /admin/settings", () => {
    expect(getSettingsSlug("/admin/settings")).toBe("");
  });

  it("returns an empty slug for /admin/settings/", () => {
    expect(getSettingsSlug("/admin/settings/")).toBe("");
  });

  it("strips the settings prefix from a nested path", () => {
    expect(getSettingsSlug("/admin/settings/whitelabel/branding")).toBe(
      "whitelabel/branding",
    );
  });

  it("returns undefined for paths outside /admin/settings", () => {
    expect(getSettingsSlug("/admin")).toBeUndefined();
    expect(getSettingsSlug("/question/1")).toBeUndefined();
  });
});
