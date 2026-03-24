import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { ACTIVE_STATUS } from "metabase/admin/people/constants";
import { createMockTenant } from "metabase-types/api/mocks";

import { TenantsListing } from "./TenantsListing";

const TenantsListingWrapper = ({
  tenants = [createMockTenant()],
}: {
  tenants?: ReturnType<typeof createMockTenant>[];
} = {}) => {
  const [searchInputValue, setSearchInputValue] = useState("");

  return (
    <TenantsListing
      tenants={tenants}
      isAdmin={true}
      searchInputValue={searchInputValue}
      setSearchInputValue={setSearchInputValue}
      status={ACTIVE_STATUS.active}
      hasNoTenants={tenants.length === 0}
    />
  );
};

const setup = (tenants = [createMockTenant()]) => {
  renderWithProviders(<TenantsListingWrapper tenants={tenants} />);
};

describe("TenantsListing", () => {
  it("shows tenants with non-Latin names", () => {
    setup([createMockTenant({ id: 10, name: "здравей", slug: "zdravey" })]);

    expect(screen.getByText("здравей")).toBeInTheDocument();
  });

  it("shows tenants with non-Latin names alongside Latin-named tenants", () => {
    setup([
      createMockTenant({ id: 10, name: "здравей", slug: "zdravey" }),
      createMockTenant({ id: 11, name: "Acme Corp", slug: "acme-corp" }),
    ]);

    expect(screen.getByText("здравей")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("filters non-Latin tenants by search text", async () => {
    setup([
      createMockTenant({ id: 10, name: "здравей", slug: "zdravey" }),
      createMockTenant({ id: 11, name: "Acme Corp", slug: "acme-corp" }),
    ]);

    const searchInput = screen.getByPlaceholderText("Find a tenant");
    await userEvent.type(searchInput, "здрав");

    expect(screen.getByText("здравей")).toBeInTheDocument();
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("excludes non-matching non-Latin tenants when searching", async () => {
    setup([
      createMockTenant({ id: 10, name: "здравей", slug: "zdravey" }),
      createMockTenant({ id: 11, name: "Acme Corp", slug: "acme-corp" }),
    ]);

    const searchInput = screen.getByPlaceholderText("Find a tenant");
    await userEvent.type(searchInput, "Acme");

    expect(screen.queryByText("здравей")).not.toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });
});
