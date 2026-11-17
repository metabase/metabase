import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { PrincipalPicker } from "./PrincipalPicker";
import type { PrincipalType } from "./api";

describe("PrincipalPicker", () => {
  it("says No results found when the search matches nobody", async () => {
    setup();

    const field = screen.getByRole("textbox", { name: "Who to preview" });
    await userEvent.click(field);
    expect(await screen.findByText("Sandy Sales")).toBeInTheDocument();
    await userEvent.type(field, "nobody by this name");

    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("Sandy Sales")).not.toBeInTheDocument();
  });

  it("lists groups in the Data tab's order, with Data Analysts built in", async () => {
    setup({ type: "group" });

    await userEvent.click(
      screen.getByRole("textbox", { name: "Who to preview" }),
    );
    const options = await screen.findAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "All internal users1 member",
      "Data Analysts1 member",
      "Sales1 member",
      "Acme partners1 member",
      "All tenant users1 member",
      "Globex resellers1 member",
    ]);
    expect(within(options[1]).getByLabelText("bolt icon")).toBeInTheDocument();
    expect(within(options[4]).getByLabelText("bolt icon")).toBeInTheDocument();
  });
});

type SetupOpts = {
  type?: PrincipalType;
};

function setup({ type = "user" }: SetupOpts = {}) {
  setupUsersEndpoints([
    createMockUserListResult({ id: 2, common_name: "Sandy Sales" }),
  ]);
  setupGroupsEndpoint([
    createMockGroup({
      id: 1,
      name: "Administrators",
      magic_group_type: "admin",
    }),
    createMockGroup({ id: 3, name: "Sales", magic_group_type: null }),
    createMockGroup({
      id: 4,
      name: "Data Analysts",
      magic_group_type: "data-analyst",
    }),
    createMockGroup({
      id: 2,
      name: "All internal users",
      magic_group_type: "all-internal-users",
    }),
    createMockGroup({
      id: 6,
      name: "Globex resellers",
      magic_group_type: null,
      is_tenant_group: true,
    }),
    createMockGroup({
      id: 5,
      name: "All tenant users",
      magic_group_type: "all-external-users",
      is_tenant_group: true,
    }),
    createMockGroup({
      id: 7,
      name: "Acme partners",
      magic_group_type: null,
      is_tenant_group: true,
    }),
  ]);
  setupTenantEntpoints([]);

  renderWithProviders(
    <PrincipalPicker value={{ type, id: 0 }} onChange={jest.fn()} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
      }),
    },
  );
}
