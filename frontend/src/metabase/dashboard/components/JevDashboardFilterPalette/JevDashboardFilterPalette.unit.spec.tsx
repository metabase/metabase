import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupJevDashboardFiltersEndpoint,
  setupJevDashboardFocusEndpoint,
} from "__support__/server-mocks/jev";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { DashboardFocus } from "metabase/api/jev";
import { setParameterValue } from "metabase/dashboard/actions";
import {
  clearFocus,
  getFocusState,
} from "metabase/dashboard/components/DashboardFocus/focus-store";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";

import { JevDashboardFilterPalette } from "./JevDashboardFilterPalette";

jest.mock("metabase/dashboard/actions", () => ({
  ...jest.requireActual("metabase/dashboard/actions"),
  setParameterValue: jest.fn((id: string, value: unknown) => ({
    type: "test/SET_PARAMETER_VALUE",
    payload: { id, value },
  })),
}));

const PARAMETERS = [
  createMockUiParameter({
    id: "vendor",
    name: "Vendor",
    slug: "vendor",
    type: "string/=",
  }),
  createMockUiParameter({
    id: "grouping",
    name: "Date Grouping",
    slug: "grouping",
    type: "temporal-unit",
    value: "month",
  }),
];

const FOCUS: DashboardFocus = {
  dashboard_id: 1,
  intent: "pouros by week",
  available: true,
  name: "E-commerce Insights",
  cards: [
    {
      dashcard_id: 10,
      card_id: 100,
      tab_id: null,
      title: "Revenue by vendor",
      pos: { row: 0, col: 0, size_x: 12, size_y: 6 },
      score: 2.7,
      focused: true,
    },
    {
      dashcard_id: 11,
      card_id: 101,
      tab_id: null,
      title: "Signups",
      pos: { row: 0, col: 12, size_x: 12, size_y: 6 },
      score: 0.4,
      focused: false,
    },
  ],
  filters: [],
};

function setup({ focus }: { focus?: DashboardFocus | "error" } = {}) {
  if (focus === "error") {
    fetchMock.post("express:/api/jev/dashboard/:id/focus", 500);
  } else {
    setupJevDashboardFocusEndpoint(focus);
  }
  setupJevDashboardFiltersEndpoint({
    status: "ok",
    candidate_count: 3,
    elapsed_ms: 240,
    jev_ms: 180,
    filters: [
      {
        parameter_id: "vendor",
        parameter_name: "Vendor",
        parameter_type: "string/=",
        value: ["Pouros and Sons"],
        label: "Pouros and Sons",
        confidence: 0.92,
        alternatives: [
          {
            value: ["Pouros and Sons"],
            label: "Pouros and Sons",
            probability: 0.92,
          },
        ],
      },
      {
        parameter_id: "grouping",
        parameter_name: "Date Grouping",
        parameter_type: "temporal-unit",
        value: "week",
        label: "Week",
        confidence: 0.4,
        alternatives: [
          { value: "week", label: "Week", probability: 0.4 },
          { value: "day", label: "Day", probability: 0.3 },
        ],
      },
    ],
  });
  renderWithProviders(
    <JevDashboardFilterPalette dashboardId={1} parameters={PARAMETERS} />,
  );
}

describe("JevDashboardFilterPalette", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFocus();
  });

  it("opens from the button and shows each parameter's current value", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Filter with Jev/ }),
    );

    const grouping = await screen.findByRole("option", {
      name: "Date Grouping",
    });
    expect(within(grouping).getByText("Month")).toBeInTheDocument();
    expect(
      within(screen.getByRole("option", { name: "Vendor" })).getByText("Any"),
    ).toBeInTheDocument();
  });

  it("opens with Ctrl+F, sets picked parameter values on Enter and closes", async () => {
    setup();

    await userEvent.keyboard("{Control>}f{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Describe your filters",
    });
    await userEvent.type(input, "pouros by week");
    await screen.findByText("Pouros and Sons");
    expect(screen.getByTestId("jev-filter-latency")).toHaveTextContent(
      /Jev · \d+ms/,
    );

    // Rows: Focus cards, Vendor, Date Grouping. Date Grouping is below the confidence bar, so one Tab
    // selects the ghosted pick.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Tab}{Enter}");

    expect(setParameterValue).toHaveBeenCalledWith("vendor", [
      "Pouros and Sons",
    ]);
    expect(setParameterValue).toHaveBeenCalledWith("grouping", "week");
    await waitFor(() =>
      expect(
        screen.queryByTestId("jev-filter-palette"),
      ).not.toBeInTheDocument(),
    );

    const call = fetchMock.callHistory.lastCall(
      "express:/api/jev/filters/dashboard/:id",
    );
    expect(call?.url).toMatch(/\/api\/jev\/filters\/dashboard\/1$/);
    expect(await call?.request?.json()).toEqual({ text: "pouros by week" });
    expect(getFocusState().active).toBe(false);
  });

  it("asks for a dashboard focus with the same text and applies it with the filters", async () => {
    setup({ focus: FOCUS });

    await userEvent.keyboard("{Control>}f{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Describe your filters",
    });
    expect(
      within(screen.getByRole("option", { name: "Focus cards" })).getByText(
        "Off",
      ),
    ).toBeInTheDocument();

    await userEvent.type(input, "pouros by week");
    await screen.findByText("Revenue by vendor");
    // The row re-mounts when its suggestion lands, so look it up again.
    expect(
      within(screen.getByRole("option", { name: "Focus cards" })).getByText(
        "Revenue by vendor",
      ),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    expect(setParameterValue).toHaveBeenCalledWith("vendor", [
      "Pouros and Sons",
    ]);
    expect(getFocusState()).toMatchObject({ active: true, result: FOCUS });
    const call = fetchMock.callHistory.lastCall(
      "express:/api/jev/dashboard/:id/focus",
    );
    expect(await call?.request?.json()).toEqual({ intent: "pouros by week" });
  });

  it("leaves the focus off when the dashboard is a weak fit, until the row is cycled", async () => {
    setup({
      focus: {
        ...FOCUS,
        cards: FOCUS.cards.map((card) => ({ ...card, score: 1.2 })),
      },
    });

    await userEvent.keyboard("{Control>}f{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Describe your filters",
    });
    await userEvent.type(input, "pouros by week");
    await screen.findByText("Revenue by vendor");
    await userEvent.keyboard("{Enter}");
    expect(getFocusState().active).toBe(false);
  });

  it("still suggests filters when the focus request fails", async () => {
    setup({ focus: "error" });

    await userEvent.keyboard("{Control>}f{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Describe your filters",
    });
    await userEvent.type(input, "pouros");
    expect(await screen.findByText("Pouros and Sons")).toBeInTheDocument();
  });

  it("closes on Escape without changing anything", async () => {
    setup();

    await userEvent.keyboard("{Control>}f{/Control}");
    const input = await screen.findByRole("combobox", {
      name: "Describe your filters",
    });
    await userEvent.type(input, "pouros");
    await screen.findByText("Pouros and Sons");
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByTestId("jev-filter-palette"),
      ).not.toBeInTheDocument(),
    );
    expect(setParameterValue).not.toHaveBeenCalled();
  });
});
