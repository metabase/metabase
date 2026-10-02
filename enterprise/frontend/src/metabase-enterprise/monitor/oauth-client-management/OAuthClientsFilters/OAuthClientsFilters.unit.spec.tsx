import userEvent from "@testing-library/user-event";

import { setupUsersEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { UserOption } from "metabase/common/components/UserPicker";
import { createMockUserListResult } from "metabase-types/api/mocks";

import type { OAuthClientsUrlState } from "../OAuthClientsPage/types";

import { OAuthClientsFilters, hasActiveFilters } from "./OAuthClientsFilters";

const ACTIVE_TAB_STATE: OAuthClientsUrlState = {
  page: 3,
  query: "",
  tab: "active",
  registered: null,
  user: null,
  sort_column: "created_at",
  sort_direction: "desc",
};

const REVOKED_TAB_STATE: OAuthClientsUrlState = {
  ...ACTIVE_TAB_STATE,
  tab: "revoked",
};

const RASTA = createMockUserListResult({
  id: 7,
  first_name: "Rasta",
  last_name: "Toucan",
  common_name: "Rasta Toucan",
});

const NO_FILTERS = {
  registered: null,
  user: null,
  page: 0,
};

type SetupOpts = {
  state?: OAuthClientsUrlState;
  selectedUser?: UserOption | null;
};

const setup = ({
  state = ACTIVE_TAB_STATE,
  selectedUser = null,
}: SetupOpts = {}) => {
  setupUsersEndpoints([RASTA]);
  const onChange = jest.fn();
  renderWithProviders(
    <OAuthClientsFilters
      state={state}
      selectedUser={selectedUser}
      onChange={onChange}
    />,
  );
  return { onChange };
};

const openFilters = () =>
  userEvent.click(screen.getByRole("button", { name: "Show filters" }));

const getPopover = () => screen.findByRole("dialog");

const apply = async () =>
  userEvent.click(
    within(await getPopover()).getByRole("button", { name: "Apply" }),
  );

const choose = async (filter: string, option: string) => {
  await userEvent.click(
    within(await getPopover()).getByRole("textbox", { name: filter }),
  );
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

describe("OAuthClientsFilters", () => {
  describe("hasActiveFilters", () => {
    it.each([
      {
        description: "the active tab has a registered filter",
        state: { ...ACTIVE_TAB_STATE, registered: "week" },
        expected: true,
      },
      {
        description: "the active tab has a user filter",
        state: { ...ACTIVE_TAB_STATE, user: 7 },
        expected: true,
      },
      {
        description: "the revoked tab carries the registered filter too",
        state: { ...REVOKED_TAB_STATE, registered: "week" },
        expected: true,
      },
      {
        description: "the revoked tab has only the active tab's user filter",
        state: { ...REVOKED_TAB_STATE, user: 7 },
        expected: false,
      },
    ] satisfies {
      description: string;
      state: OAuthClientsUrlState;
      expected: boolean;
    }[])("is $expected when $description", ({ state, expected }) => {
      expect(hasActiveFilters(state)).toBe(expected);
    });
  });

  it.each([
    {
      state: ACTIVE_TAB_STATE,
      shown: ["Registered", "User"],
      hidden: [],
    },
    {
      state: REVOKED_TAB_STATE,
      shown: ["Registered"],
      hidden: ["User"],
    },
  ])(
    "offers the $state.tab tab's filters",
    async ({ state, shown, hidden }) => {
      setup({ state });
      await openFilters();
      const popover = await getPopover();

      shown.forEach((label) =>
        expect(within(popover).getByText(label)).toBeInTheDocument(),
      );
      hidden.forEach((label) =>
        expect(within(popover).queryByText(label)).not.toBeInTheDocument(),
      );
    },
  );

  it("applies the chosen window, back on the first page", async () => {
    const { onChange } = setup();
    await openFilters();

    await choose("Registered", "Past week");
    await apply();

    expect(onChange).toHaveBeenCalledWith({
      ...NO_FILTERS,
      registered: "week",
    });
  });

  it("applies a user as the id the URL carries", async () => {
    const { onChange } = setup();
    await openFilters();

    await userEvent.click(
      within(await getPopover()).getByPlaceholderText("Any user"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Rasta Toucan" }),
    );
    await apply();

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, user: 7 });
  });

  it("discards unapplied changes when closed without applying", async () => {
    const { onChange } = setup();
    await openFilters();
    await choose("Registered", "Past week");

    await openFilters();
    expect(onChange).not.toHaveBeenCalled();

    await openFilters();
    await apply();

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });

  it("clears every filter, back on the first page", async () => {
    const { onChange } = setup({
      state: { ...ACTIVE_TAB_STATE, registered: "week", user: 7 },
      selectedUser: { id: 7, label: "Rasta Toucan" },
    });
    await openFilters();

    await userEvent.click(
      within(await getPopover()).getByRole("button", { name: "Clear filters" }),
    );

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });
});
