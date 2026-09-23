import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupJevDashboardFiltersEndpoint } from "__support__/server-mocks/jev";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { setParameterValue } from "metabase/dashboard/actions";
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

function setup() {
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
  beforeEach(() => jest.clearAllMocks());

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
      "Jev · 180ms",
    );

    // Date Grouping is below the confidence bar, so one Tab selects the ghosted pick.
    await userEvent.keyboard("{ArrowDown}{Tab}{Enter}");

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
