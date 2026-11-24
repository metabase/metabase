import userEvent from "@testing-library/user-event";

import { setupGroupsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Group, GroupInfo } from "metabase-types/api";

import { GroupPreviewInfo } from "./GroupPreviewInfo";

const ALL_USERS: GroupInfo = {
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
  member_count: 4,
};
const ALL_TENANT_USERS: GroupInfo = {
  id: 3,
  name: "All tenant users",
  magic_group_type: "all-external-users",
  member_count: 0,
};
const SALES: GroupInfo = {
  id: 9,
  name: "Sales",
  magic_group_type: null,
  member_count: 1,
};
const ACME: GroupInfo = {
  id: 10,
  name: "Acme analysts",
  magic_group_type: null,
  is_tenant_group: true,
  member_count: 3,
};

function setup(group: GroupInfo, { isNarrow = false } = {}) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: !isNarrow && query.includes("min-width"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  const groups: Omit<Group, "members">[] = [
    ALL_USERS,
    ALL_TENANT_USERS,
    SALES,
    ACME,
  ];
  setupGroupsEndpoint(groups);
  renderWithProviders(<GroupPreviewInfo group={group} />);
}

describe("GroupPreviewInfo", () => {
  it("explains the stand-in on hover, naming the groups it is in", async () => {
    setup(SALES);

    await userEvent.hover(screen.getByText("How group preview works"));

    expect(
      await screen.findByText("A stand-in, not a real user"),
    ).toBeVisible();
    expect(
      await screen.findByText(
        /In Sales and All Users only\. Where a rule reads an attribute, it uses the value you pick\./,
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Real members may see more through their other groups."),
    ).toBeVisible();
  });

  it("explains the stand-in on keyboard focus too", async () => {
    setup(SALES);

    await userEvent.tab();

    expect(
      await screen.findByText("A stand-in, not a real user"),
    ).toBeVisible();
  });

  it("names the tenant group's own magic group", async () => {
    setup(ACME);

    await userEvent.hover(screen.getByText("How group preview works"));

    expect(
      await screen.findByText(/In Acme analysts and All tenant users only\./),
    ).toBeVisible();
  });

  it("names a magic group once", async () => {
    setup(ALL_USERS);

    await userEvent.hover(screen.getByText("How group preview works"));

    expect(await screen.findByText(/In All Users only\./)).toBeVisible();
  });

  it("is a shorter label on a narrow window", () => {
    setup(SALES, { isNarrow: true });

    expect(
      screen.getByRole("button", { name: "How it works: group preview" }),
    ).toHaveTextContent("How it works");
  });
});
