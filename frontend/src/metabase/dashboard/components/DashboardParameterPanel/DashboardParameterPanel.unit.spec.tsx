import userEvent from "@testing-library/user-event";

import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { ParameterId, ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { DashboardParameterPanel } from "./DashboardParameterPanel";
import { useListItemWidths } from "./use-list-item-widths";

// jsdom has no layout, so the widths the list would measure are set per test
jest.mock("./use-list-item-widths");

const DASHBOARD_ID = 1;
const GAP = 10;

const PARAMETERS = ["a", "b", "c", "d", "e"].map((id) =>
  createMockParameter({ id, slug: id, name: `Filter ${id.toUpperCase()}` }),
);

interface SetupOpts {
  itemWidths: number[];
  availableWidth: number;
  parameterValues?: Record<ParameterId, ParameterValueOrArray>;
  isEditing?: boolean;
}

function setup({
  itemWidths,
  availableWidth,
  parameterValues = {},
  isEditing = false,
}: SetupOpts) {
  jest
    .mocked(useListItemWidths)
    .mockImplementation(({ isEnabled }) =>
      isEnabled ? { itemWidths, availableWidth, gap: GAP } : null,
    );

  renderWithProviders(
    <MockDashboardContext dashboardId={DASHBOARD_ID} isEditing={isEditing}>
      <DashboardParameterPanel />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              id: DASHBOARD_ID,
              parameters: PARAMETERS,
              dashcards: [],
              tabs: [],
            }),
          },
          parameterValues,
        }),
      },
    },
  );
}

const queryToggle = () =>
  screen.queryByRole("button", {
    name: /^Show (fewer filters|\d+ more filters?)/,
  });

describe("DashboardParameterPanel", () => {
  it("should not show the toggle when every filter fits on one row", () => {
    setup({ itemWidths: [100, 100, 100, 100, 100], availableWidth: 1000 });

    expect(screen.getAllByTestId("parameter-widget")).toHaveLength(5);
    expect(queryToggle()).not.toBeInTheDocument();
  });

  it("should start expanded when the filters don't fit on one row", () => {
    setup({ itemWidths: [100, 100, 100, 100, 100], availableWidth: 320 });

    expect(
      screen.getByRole("button", { name: "Show fewer filters" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("should collapse and expand the filters", async () => {
    setup({ itemWidths: [100, 100, 100, 100, 100], availableWidth: 320 });

    await userEvent.click(
      screen.getByRole("button", { name: "Show fewer filters" }),
    );
    expect(
      screen.getByRole("button", { name: "Show 2 more filters" }),
    ).toHaveAttribute("aria-expanded", "false");
    // Hidden filters stay mounted, keeping their values and widths
    expect(screen.getAllByTestId("parameter-widget")).toHaveLength(5);

    await userEvent.click(
      screen.getByRole("button", { name: "Show 2 more filters" }),
    );
    expect(
      screen.getByRole("button", { name: "Show fewer filters" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("should keep a filter with a value on the collapsed row before ones without", async () => {
    setup({
      itemWidths: [100, 100, 100, 100, 100],
      availableWidth: 320,
      parameterValues: { e: ["foo"] },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Show fewer filters" }),
    );

    // Without priority, "e" would be among the hidden filters and count as active
    expect(
      screen.getByRole("button", { name: "Show 2 more filters" }),
    ).toBeInTheDocument();
  });

  it("should count hidden filters that have a value", async () => {
    setup({
      itemWidths: [100, 100, 100, 200, 200],
      availableWidth: 320,
      parameterValues: { d: ["foo"], e: ["bar"] },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Show fewer filters" }),
    );

    expect(
      screen.getByRole("button", { name: "Show 3 more filters (1 active)" }),
    ).toBeInTheDocument();
  });

  it("should use the singular for one hidden filter", async () => {
    setup({ itemWidths: [60, 60, 60, 60, 200], availableWidth: 320 });

    await userEvent.click(
      screen.getByRole("button", { name: "Show fewer filters" }),
    );

    expect(
      screen.getByRole("button", { name: "Show 1 more filter" }),
    ).toBeInTheDocument();
  });

  it("should not show the toggle while editing the dashboard", () => {
    setup({
      itemWidths: [100, 100, 100, 100, 100],
      availableWidth: 320,
      isEditing: true,
    });

    expect(screen.getAllByTestId("editing-parameter-widget")).toHaveLength(5);
    expect(queryToggle()).not.toBeInTheDocument();
  });
});
