import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import type { PrincipalType } from "../api";

import { PreviewSidebar } from "./PreviewSidebar";

describe("PreviewSidebar", () => {
  it("offers User and Group only, even with tenants on", async () => {
    setup();

    expect(await screen.findByRole("radio", { name: "User" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Group" })).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("says No results found when the search matches nobody", async () => {
    setup();

    expect(await screen.findByText("Sandy Sales")).toBeInTheDocument();
    await userEvent.type(
      screen.getByPlaceholderText("Search for a user"),
      "nobody by this name",
    );

    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("Sandy Sales")).not.toBeInTheDocument();
  });

  it("says a group preview is a stand-in while Group is chosen", async () => {
    setup({ principalType: "group" });

    expect(
      await screen.findByText("Previews a stand-in member, not a real user."),
    ).toBeInTheDocument();
  });
});

type SetupOpts = {
  principalType?: PrincipalType;
};

function setup({ principalType = "user" }: SetupOpts = {}) {
  setupUsersEndpoints([
    createMockUserListResult({
      id: 2,
      common_name: "Sandy Sales",
      first_name: "Sandy",
      last_name: "Sales",
      email: "sandy@example.com",
    }),
  ]);
  setupGroupsEndpoint([createMockGroup({ id: 5, name: "Sales" })]);
  setupTenantEntpoints([]);

  renderWithProviders(
    <Route
      path="/"
      element={
        <PreviewSidebar
          principalType={principalType}
          principal={null}
          onPrincipalTypeChange={jest.fn()}
          onPrincipalChange={jest.fn()}
        />
      }
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
      }),
    },
  );
}
