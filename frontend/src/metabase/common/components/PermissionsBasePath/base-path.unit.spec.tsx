import { renderWithProviders, screen } from "__support__/ui";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
  getPermissionsBasePath,
  usePermissionsBasePath,
} from "./base-path";

const HUB_BASE_PATH = "/admin/embedding/permissions";

// Two hosts claiming the same path, the way the Tenancy and Permissions tabs
// both do.
function TenancyHost() {
  usePermissionsBasePath(HUB_BASE_PATH);

  return <div>tenancy</div>;
}

function PermissionsHost() {
  usePermissionsBasePath(HUB_BASE_PATH);

  return <div>permissions</div>;
}

function Tab({ name }: { name: "tenancy" | "permissions" }) {
  return name === "tenancy" ? <TenancyHost /> : <PermissionsHost />;
}

describe("usePermissionsBasePath", () => {
  it("claims the base path while mounted", () => {
    renderWithProviders(<Tab name="permissions" />);

    expect(getPermissionsBasePath()).toBe(HUB_BASE_PATH);
  });

  it("releases the base path on unmount", () => {
    const { unmount } = renderWithProviders(<Tab name="permissions" />);

    unmount();

    expect(getPermissionsBasePath()).toBe(ADMIN_PERMISSIONS_BASE_PATH);
  });

  it("keeps the path when one host replaces another claiming the same path", () => {
    // React renders the incoming host before cleaning up the outgoing one, so
    // the outgoing cleanup runs after the incoming claim. Both hosts claim the
    // same string, so only the owning token can tell them apart.
    const { rerender } = renderWithProviders(<Tab name="tenancy" />);

    rerender(<Tab name="permissions" />);

    expect(screen.getByText("permissions")).toBeInTheDocument();
    expect(getPermissionsBasePath()).toBe(HUB_BASE_PATH);
  });
});
