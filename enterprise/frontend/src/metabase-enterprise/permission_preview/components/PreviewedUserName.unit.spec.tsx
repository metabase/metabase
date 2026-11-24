import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGroupsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Group } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { PreviewedUserName } from "./PreviewedUserName";

const USER = createMockUser({
  id: 2,
  common_name: "Sandy Sales",
  email: "sandy@example.com",
});

const GROUPS: Omit<Group, "members">[] = [
  { id: 1, name: "All Users", magic_group_type: "all-internal-users" },
  { id: 9, name: "Sales", magic_group_type: null },
  { id: 10, name: "Support", magic_group_type: null },
];

function setup(attributes: Record<string, string> | null) {
  setupGroupsEndpoint(GROUPS);
  fetchMock.get("path:/api/user/2", {
    ...USER,
    attributes,
    user_group_memberships: [
      { id: 1, is_group_manager: false },
      { id: 9, is_group_manager: false },
    ],
  });

  renderWithProviders(<PreviewedUserName user={USER} />);
}

describe("PreviewedUserName", () => {
  it("shows who the person is on hover: email, groups and attributes", async () => {
    setup({ state: "TX", team: "Sales", "@tenant.slug": "acme" });

    await userEvent.hover(screen.getByRole("button", { name: "Sandy Sales" }));

    expect(await screen.findByText("sandy@example.com")).toBeVisible();
    expect(await screen.findByText("All Users, Sales")).toBeVisible();
    expect(screen.getByText("state")).toBeVisible();
    expect(screen.getByText("TX")).toBeVisible();
    expect(screen.getByText("team")).toBeVisible();
  });

  it("hides the attributes that start with @", async () => {
    setup({ state: "TX", "@tenant.slug": "acme" });

    await userEvent.hover(screen.getByRole("button", { name: "Sandy Sales" }));
    await screen.findByText("state");

    expect(screen.queryByText("@tenant.slug")).not.toBeInTheDocument();
  });

  it("says when the person has no attributes", async () => {
    setup(null);

    await userEvent.hover(screen.getByRole("button", { name: "Sandy Sales" }));

    expect(await screen.findByText("No user attributes")).toBeVisible();
  });

  it("opens on keyboard focus, not only on hover", async () => {
    setup({ state: "TX" });

    await userEvent.tab();

    expect(await screen.findByText("sandy@example.com")).toBeVisible();
  });

  it("shows nothing until the name is hovered or focused", () => {
    setup({ state: "TX" });

    expect(screen.queryByText("sandy@example.com")).not.toBeInTheDocument();
  });
});
