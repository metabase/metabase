import {
  ADMIN_TENANTS_BASE_PATH,
  getTenantsBasePath,
  resetTenantsBasePath,
  setTenantsBasePath,
} from "./tenant-urls";

describe("tenant-urls", () => {
  afterEach(() => {
    resetTenantsBasePath();
  });

  it("defaults to admin", () => {
    expect(getTenantsBasePath()).toBe(ADMIN_TENANTS_BASE_PATH);
  });

  it("rebases onto whichever host set it", () => {
    setTenantsBasePath("/embedding/tenancy");

    expect(getTenantsBasePath()).toBe("/embedding/tenancy");
  });

  it("reverts to admin on reset", () => {
    setTenantsBasePath("/embedding/tenancy");
    resetTenantsBasePath();

    expect(getTenantsBasePath()).toBe(ADMIN_TENANTS_BASE_PATH);
  });
});
