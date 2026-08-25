import {
  ADMIN_TENANTS_BASE_PATH,
  getTenantsBasePath,
  getTenantsPermissionsPath,
  resetTenantsBasePath,
  setTenantsBasePath,
  tenantGroupUrl,
  tenantPeopleUrl,
} from "./tenant-urls";

describe("tenant-urls", () => {
  afterEach(() => {
    resetTenantsBasePath();
  });

  it("defaults to admin", () => {
    expect(getTenantsBasePath()).toBe(ADMIN_TENANTS_BASE_PATH);
    expect(getTenantsPermissionsPath()).toBe("/admin/permissions");
    expect(tenantPeopleUrl()).toBe(`${ADMIN_TENANTS_BASE_PATH}/people`);
    expect(tenantGroupUrl(3)).toBe(`${ADMIN_TENANTS_BASE_PATH}/groups/3`);
  });

  it("rebases every URL onto whichever host set it", () => {
    setTenantsBasePath("/embedding/tenancy", {
      permissionsPath: "/embedding/permissions",
    });

    expect(getTenantsBasePath()).toBe("/embedding/tenancy");
    expect(getTenantsPermissionsPath()).toBe("/embedding/permissions");
    expect(tenantPeopleUrl()).toBe("/embedding/tenancy/people");
    expect(tenantGroupUrl(3)).toBe("/embedding/tenancy/groups/3");
  });

  it("falls back to the admin permissions path when none is given", () => {
    setTenantsBasePath("/embedding/tenancy");

    expect(getTenantsPermissionsPath()).toBe("/admin/permissions");
  });

  it("reverts to admin on reset", () => {
    setTenantsBasePath("/embedding/tenancy");
    resetTenantsBasePath();

    expect(getTenantsBasePath()).toBe(ADMIN_TENANTS_BASE_PATH);
    expect(getTenantsPermissionsPath()).toBe("/admin/permissions");
  });
});
