import { render, screen } from "@testing-library/react";

import { TenantUrlsProvider, useTenantUrls } from "./TenantUrlsProvider";
import { ADMIN_TENANTS_BASE_PATH, createTenantUrls } from "./tenant-urls";

function ShowUrls() {
  const urls = useTenantUrls();

  return (
    <ul>
      <li data-testid="root">{urls.root()}</li>
      <li data-testid="user-strategy">{urls.userStrategy()}</li>
      <li data-testid="edit-tenant">{urls.editTenant(7)}</li>
      <li data-testid="people">{urls.people()}</li>
      <li data-testid="group">{urls.group(3)}</li>
    </ul>
  );
}

describe("createTenantUrls", () => {
  it("builds every URL from the base path it is given", () => {
    const urls = createTenantUrls("/embedding/tenancy");

    expect(urls.root()).toBe("/embedding/tenancy");
    expect(urls.userStrategy()).toBe("/embedding/tenancy/user-strategy");
    expect(urls.newTenant()).toBe("/embedding/tenancy/new");
    expect(urls.editTenant(7)).toBe("/embedding/tenancy/7/edit");
    expect(urls.deactivateTenant(7)).toBe("/embedding/tenancy/7/deactivate");
    expect(urls.reactivateTenant(7)).toBe("/embedding/tenancy/7/reactivate");

    expect(urls.people()).toBe("/embedding/tenancy/people");
    expect(urls.newUser()).toBe("/embedding/tenancy/people/new");
    expect(urls.editUser(4)).toBe("/embedding/tenancy/people/4/edit");
    expect(urls.resetUserPassword(4)).toBe("/embedding/tenancy/people/4/reset");
    expect(urls.newUserSuccess(4)).toBe("/embedding/tenancy/people/4/success");
    expect(urls.deactivateUser(4)).toBe(
      "/embedding/tenancy/people/4/deactivate",
    );
    expect(urls.reactivateUser(4)).toBe(
      "/embedding/tenancy/people/4/reactivate",
    );
    expect(urls.unsubscribeUser(4)).toBe(
      "/embedding/tenancy/people/4/unsubscribe",
    );

    expect(urls.groups()).toBe("/embedding/tenancy/groups");
    expect(urls.group(3)).toBe("/embedding/tenancy/groups/3");
  });
});

describe("TenantUrlsProvider", () => {
  it("defaults to admin outside a provider", () => {
    // Admin People's own list and Monitor's deep links render with no hub
    // subtree above them, so the default has to be admin or they break.
    render(<ShowUrls />);

    expect(screen.getByTestId("root")).toHaveTextContent(
      ADMIN_TENANTS_BASE_PATH,
    );
    expect(screen.getByTestId("user-strategy")).toHaveTextContent(
      "/admin/people/tenants/user-strategy",
    );
    expect(screen.getByTestId("edit-tenant")).toHaveTextContent(
      "/admin/people/tenants/7/edit",
    );
  });

  it("rebases every URL onto the host that declared it", () => {
    render(
      <TenantUrlsProvider basePath="/embedding/tenancy">
        <ShowUrls />
      </TenantUrlsProvider>,
    );

    expect(screen.getByTestId("root")).toHaveTextContent("/embedding/tenancy");
    expect(screen.getByTestId("people")).toHaveTextContent(
      "/embedding/tenancy/people",
    );
    expect(screen.getByTestId("group")).toHaveTextContent(
      "/embedding/tenancy/groups/3",
    );
  });

  it("leaves the default intact after a provider unmounts", () => {
    const { unmount } = render(
      <TenantUrlsProvider basePath="/embedding/tenancy">
        <ShowUrls />
      </TenantUrlsProvider>,
    );

    unmount();
    render(<ShowUrls />);

    expect(screen.getByTestId("root")).toHaveTextContent(
      ADMIN_TENANTS_BASE_PATH,
    );
  });
});
