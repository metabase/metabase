import userEvent from "@testing-library/user-event";

import { setupPermissionPreviewPrincipalsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { PrincipalList } from "./PrincipalList";
import type { PreviewPrincipalsResponse, Principal } from "./api";

const SALES_GROUP_ID = 5;

const SALES_GROUP = {
  id: SALES_GROUP_ID,
  name: "Sales",
  detail: null,
  member_count: 2,
  built_in: false,
  tenant_side: false,
};

const USERS = [
  { id: 1, name: "Dana Analyst", email: "dana@example.com", group_ids: [1] },
  {
    id: 2,
    name: "Sandy Sales",
    email: "sandy@example.com",
    group_ids: [1, SALES_GROUP_ID],
  },
  {
    id: 3,
    name: "Sara Seller",
    email: "sara@example.com",
    group_ids: [1, SALES_GROUP_ID],
  },
];

describe("PrincipalList", () => {
  it("is one Tab stop, starting on the person being previewed", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    const list = screen.getByRole("listbox", { name: "Users" });
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Sandy Sales/ }).id,
    );

    await userEvent.tab();
    expect(list).not.toHaveFocus();
    expect(
      screen.getByRole("option", { name: /Sara Seller/ }),
    ).not.toHaveFocus();
  });

  it("moves with ↑ and ↓ and previews the row on Enter", async () => {
    const { onPrincipalChange } = await setup({
      principal: { type: "user", id: 2 },
    });
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    const list = screen.getByRole("listbox", { name: "Users" });
    expect(list).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    expect(list).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Sara Seller/ }).id,
    );
    expect(onPrincipalChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}");
    expect(list).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Dana Analyst/ }).id,
    );

    await userEvent.keyboard("{Enter}");
    expect(onPrincipalChange).toHaveBeenCalledTimes(1);
    expect(onPrincipalChange).toHaveBeenCalledWith({ type: "user", id: 1 });
  });

  it("marks only the person being previewed as selected", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    expect(screen.getByRole("option", { name: /Sandy Sales/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("option", { name: /Dana Analyst/ }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("starts on the first match after a search", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Search" }),
      "sar",
    );

    const list = screen.getByRole("listbox", { name: "Users" });
    expect(
      screen.queryByRole("option", { name: /Sandy Sales/ }),
    ).not.toBeInTheDocument();
    expect(list).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Sara Seller/ }).id,
    );
  });

  it("says No results found when the search matches nobody", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Search" }),
      "nobody by this name",
    );

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("names its switch Preview as", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    expect(
      screen.getByRole("radiogroup", { name: "Preview as" }),
    ).toBeInTheDocument();
  });

  it("pluralizes each group's member count", async () => {
    await setup({
      principal: { type: "group", id: 10 },
      groups: [
        {
          id: 10,
          name: "Sales",
          detail: null,
          member_count: 7,
          built_in: false,
          tenant_side: false,
        },
        {
          id: 11,
          name: "Finance",
          detail: null,
          member_count: 1,
          built_in: false,
          tenant_side: false,
        },
      ],
    });

    expect(screen.getByRole("option", { name: /Sales/ })).toHaveTextContent(
      "7 members",
    );
    expect(screen.getByRole("option", { name: /Finance/ })).toHaveTextContent(
      "1 member",
    );
  });

  it("says a group preview is a stand-in while Group is chosen", async () => {
    await setup({
      principal: { type: "group", id: SALES_GROUP_ID },
      groups: [SALES_GROUP],
    });

    expect(
      screen.getByText("Previews a stand-in member, not a real user."),
    ).toBeInTheDocument();
  });

  it("doesn't say it while User is chosen", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    expect(
      screen.queryByText("Previews a stand-in member, not a real user."),
    ).not.toBeInTheDocument();
  });

  it("offers User and Group only, even with tenants on", async () => {
    await setup({ principal: { type: "user", id: 2 } });

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "User" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Group" })).toBeInTheDocument();
  });
});

type SetupOpts = {
  principal: Principal;
  groups?: PreviewPrincipalsResponse["groups"];
};

async function setup({ principal, groups = [] }: SetupOpts) {
  setupPermissionPreviewPrincipalsEndpoint({
    users: USERS.map((user) => ({
      ...user,
      detail: null,
      member_count: null,
      tenant_side: false,
    })),
    groups,
  });
  const onPrincipalChange = jest.fn<void, [Principal]>();

  renderWithProviders(
    <PrincipalList
      principal={principal}
      onPrincipalChange={onPrincipalChange}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
      }),
    },
  );
  await screen.findAllByRole("option");

  return { onPrincipalChange };
}
