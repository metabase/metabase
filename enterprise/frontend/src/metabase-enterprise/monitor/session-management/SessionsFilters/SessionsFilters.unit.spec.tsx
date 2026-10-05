import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { SessionsUrlState } from "../SessionsPage/types";

import { SessionsFilters, hasActiveFilters } from "./SessionsFilters";

const ACTIVE_TAB_STATE: SessionsUrlState = {
  page: 3,
  query: "",
  tab: "active",
  provider: [],
  last_active: null,
  ended: null,
  reason: null,
  sort_column: "created_at",
  sort_direction: "desc",
};

const ENDED_TAB_STATE: SessionsUrlState = {
  ...ACTIVE_TAB_STATE,
  tab: "ended",
};

const NO_FILTERS = {
  provider: [],
  last_active: null,
  ended: null,
  reason: null,
  page: 0,
};

const setup = (state: SessionsUrlState = ACTIVE_TAB_STATE) => {
  const onChange = jest.fn();
  renderWithProviders(<SessionsFilters state={state} onChange={onChange} />);
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

describe("SessionsFilters", () => {
  describe("hasActiveFilters", () => {
    it.each([
      {
        description: "the active tab has an auth method filter",
        state: { ...ACTIVE_TAB_STATE, provider: ["saml"] },
        expected: true,
      },
      {
        description: "the active tab has only ended-tab filters",
        state: { ...ACTIVE_TAB_STATE, ended: "week", reason: "admin" },
        expected: false,
      },
      {
        description: "the ended tab has a reason filter",
        state: { ...ENDED_TAB_STATE, reason: "admin" },
        expected: true,
      },
      {
        description: "the ended tab has only an active-tab filter",
        state: { ...ENDED_TAB_STATE, last_active: "day" },
        expected: false,
      },
    ] satisfies {
      description: string;
      state: SessionsUrlState;
      expected: boolean;
    }[])("is $expected when $description", ({ state, expected }) => {
      expect(hasActiveFilters(state)).toBe(expected);
    });
  });

  it.each([
    {
      state: ACTIVE_TAB_STATE,
      shown: ["Auth method", "Last active"],
      hidden: ["Ended", "Reason"],
    },
    {
      state: ENDED_TAB_STATE,
      shown: ["Auth method", "Ended", "Reason"],
      hidden: ["Last active"],
    },
  ])(
    "offers the $state.tab tab's filters",
    async ({ state, shown, hidden }) => {
      setup(state);
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

  it("applies the chosen filters, back on the first page", async () => {
    const { onChange } = setup(ACTIVE_TAB_STATE);
    await openFilters();

    await userEvent.click(within(await getPopover()).getByText("SAML"));
    await userEvent.click(within(await getPopover()).getByText("JWT"));
    await choose("Last active", "Past day");
    await apply();

    expect(onChange).toHaveBeenCalledWith({
      ...NO_FILTERS,
      provider: ["saml", "jwt"],
      last_active: "day",
    });
  });

  it("applies the ended tab's filters", async () => {
    const { onChange } = setup(ENDED_TAB_STATE);
    await openFilters();

    await choose("Ended", "Past week");
    await choose("Reason", "Revoked by admin");
    await apply();

    expect(onChange).toHaveBeenCalledWith({
      ...NO_FILTERS,
      ended: "week",
      reason: "admin",
    });
  });

  it("discards unapplied changes when closed without applying", async () => {
    const { onChange } = setup(ACTIVE_TAB_STATE);
    await openFilters();
    await userEvent.click(within(await getPopover()).getByText("SAML"));

    await openFilters();
    expect(onChange).not.toHaveBeenCalled();

    await openFilters();
    await apply();

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });

  it("clears every filter, back on the first page", async () => {
    const { onChange } = setup({
      ...ENDED_TAB_STATE,
      provider: ["saml"],
      ended: "week",
      reason: "admin",
    });
    await openFilters();

    await userEvent.click(
      within(await getPopover()).getByRole("button", { name: "Clear filters" }),
    );

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });
});
