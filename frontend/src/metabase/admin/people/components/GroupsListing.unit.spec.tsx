import userEvent from "@testing-library/user-event";

import { setupApiKeyEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupsListing } from "./GroupsListing";

const setup = (groups = [createMockGroup()]) => {
  setupApiKeyEndpoints([]);

  const props = {
    groups: groups.map((g) => ({ ...g, members: [] })),
    isAdmin: true,
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  renderWithProviders(<GroupsListing {...props} />);
};

describe("GroupsListing", () => {
  it("shows groups with non-Latin names", async () => {
    setup([
      createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
    ]);

    expect(await screen.findByText("здравей")).toBeInTheDocument();
  });

  it("shows groups with non-Latin names alongside Latin-named groups", async () => {
    setup([
      createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
      createMockGroup({ id: 11, name: "Engineering", magic_group_type: null }),
    ]);

    expect(await screen.findByText("здравей")).toBeInTheDocument();
    expect(await screen.findByText("Engineering")).toBeInTheDocument();
  });

  it("filters non-Latin groups by search text", async () => {
    setup([
      createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
      createMockGroup({ id: 11, name: "Engineering", magic_group_type: null }),
    ]);

    await screen.findByText("здравей");
    const searchInput = screen.getByPlaceholderText("Find a group");
    await userEvent.type(searchInput, "здрав");

    expect(screen.getByText("здравей")).toBeInTheDocument();
    expect(screen.queryByText("Engineering")).not.toBeInTheDocument();
  });

  it("excludes non-matching non-Latin groups when searching", async () => {
    setup([
      createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
      createMockGroup({ id: 11, name: "Engineering", magic_group_type: null }),
    ]);

    await screen.findByText("здравей");
    const searchInput = screen.getByPlaceholderText("Find a group");
    await userEvent.type(searchInput, "Eng");

    expect(screen.queryByText("здравей")).not.toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  const activeAppGroup = createMockGroup({
    id: 11,
    name: "Data App: orders",
    magic_group_type: null,
    is_data_app_group: true,
  });
  const staleAppGroup = createMockGroup({
    id: 12,
    name: "Data App: orphaned",
    magic_group_type: null,
    is_data_app_group: true,
    is_stale_data_app_group: true,
  });

  it("badges a stale data-app group but not an active one or an ordinary group", async () => {
    setup([
      createMockGroup({ id: 10, name: "Engineering", magic_group_type: null }),
      activeAppGroup,
      staleAppGroup,
    ]);

    expect(await screen.findByText("Data App: orphaned")).toBeInTheDocument();
    expect(screen.getAllByText("Stale")).toHaveLength(1);
  });

  it("links ordinary and active data-app group names, but not a stale one's", async () => {
    setup([
      createMockGroup({ id: 10, name: "Engineering", magic_group_type: null }),
      activeAppGroup,
      staleAppGroup,
    ]);

    await screen.findByText("Data App: orphaned");

    expect(screen.getByRole("link", { name: /Engineering/ })).toHaveAttribute(
      "href",
      "/admin/people/groups/10",
    );
    expect(
      screen.getByRole("link", { name: /Data App: orders/ }),
    ).toHaveAttribute("href", "/admin/people/groups/11");
    expect(
      screen.queryByRole("link", { name: /Data App: orphaned/ }),
    ).not.toBeInTheDocument();
  });

  it("gives a stale data-app group a direct delete button, not an edit menu", async () => {
    setup([staleAppGroup]);

    await screen.findByText("Data App: orphaned");

    expect(
      screen.queryByLabelText("group-action-button"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Remove Group"));

    expect(await screen.findByText("Remove this group?")).toBeInTheDocument();
    expect(screen.queryByText("Edit Name")).not.toBeInTheDocument();
  });

  it("gives an active data-app group no row actions", async () => {
    setup([activeAppGroup]);

    await screen.findByText("Data App: orders");

    expect(
      screen.queryByLabelText("group-action-button"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove Group")).not.toBeInTheDocument();
  });

  it("keeps Edit Name in an ordinary group's actions menu", async () => {
    setup([
      createMockGroup({ id: 11, name: "Engineering", magic_group_type: null }),
    ]);

    await screen.findByText("Engineering");
    await userEvent.click(screen.getByLabelText("group-action-button"));

    expect(await screen.findByText("Edit Name")).toBeInTheDocument();
  });
});
