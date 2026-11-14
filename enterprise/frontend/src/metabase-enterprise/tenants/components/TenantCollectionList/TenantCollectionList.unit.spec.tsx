import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { Route } from "metabase/router";
import { createMockTenant } from "metabase-types/api/mocks";

import { TenantCollectionList } from "./TenantCollectionList";

const ACTIVE_TENANTS = [
  createMockTenant({
    id: 1,
    name: "Tenant 01",
    slug: "tenant-01",
    tenant_collection_id: 101,
  }),
  createMockTenant({
    id: 2,
    name: "Tenant 02",
    slug: "tenant-02",
    tenant_collection_id: 102,
  }),
  createMockTenant({
    id: 3,
    name: "Tenant 03",
    slug: "tenant-03",
    tenant_collection_id: 103,
  }),
];

const DEACTIVATED_TENANT = createMockTenant({
  id: 4,
  name: "Deactivated Tenant",
  slug: "deactivated-tenant",
  is_active: false,
  tenant_collection_id: 104,
});

const setup = () => {
  // Like the API, only `status=active` leaves out the deactivated tenant.
  fetchMock.get("path:/api/ee/tenant", (call) => {
    const status = new URL(call.url).searchParams.get("status");
    return {
      data:
        status === "active"
          ? ACTIVE_TENANTS
          : [...ACTIVE_TENANTS, DEACTIVATED_TENANT],
    };
  });

  return renderWithProviders(
    <>
      <Route
        path="/collection/tenant-specific"
        element={<TenantCollectionList />}
      />
      <Route
        path="/collection/:slug"
        element={<div data-testid="collection-page" />}
      />
    </>,
    { withRouter: true, initialRoute: "/collection/tenant-specific" },
  );
};

describe("TenantCollectionList", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("lists the collections of active tenants as links", async () => {
    setup();

    for (const tenant of ACTIVE_TENANTS) {
      expect(
        await screen.findByRole("link", { name: new RegExp(tenant.name) }),
      ).toHaveAttribute("href", `/collection/${tenant.tenant_collection_id}`);
      expect(screen.getByText(tenant.name)).toBeVisible();
    }

    const [call] = fetchMock.callHistory.calls("path:/api/ee/tenant");
    expect(new URL(call.url).searchParams.get("status")).toBe("active");
  });

  it("does not list deactivated tenants", async () => {
    setup();

    expect(await screen.findByText("Tenant 03")).toBeInTheDocument();
    expect(screen.queryByText("Deactivated Tenant")).not.toBeInTheDocument();
  });

  it("navigates to the tenant collection", async () => {
    const { router } = setup();

    await userEvent.click(await screen.findByText("Tenant 02"));

    expect(await screen.findByTestId("collection-page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/collection/102");
  });
});
