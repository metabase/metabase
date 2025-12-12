/* eslint-disable testing-library/no-node-access */

import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { renderWithProviders, screen } from "__support__/ui";
import type { DashboardCard, DashboardTab } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockHeadingDashboardCard,
  createMockIFrameDashboardCard,
  createMockLinkDashboardCard,
  createMockParameter,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { MoveParameterMenu } from "./MoveParameterMenu";

const TEST_PARAMETER = createMockParameter();

const TEST_DASHCARD = createMockDashboardCard({
  id: 1,
  card: createMockCard({
    id: 1,
    name: "My question card",
  }),
});

const TEST_HEADING_DASHCARD = createMockHeadingDashboardCard({
  id: 2,
  text: "My heading card",
});

type SetupOpts = {
  tabs?: DashboardTab[];
  dashcards: DashboardCard[];
};

async function setup({ tabs = [], dashcards }: SetupOpts) {
  const dashboard = createMockDashboard({
    tabs,
    dashcards,
    parameters: [TEST_PARAMETER],
  });
  const otherDashboardDashcards: DashboardCard[] = [
    { ...TEST_DASHCARD, id: 1001, dashboard_id: 1001 },
  ];

  renderWithProviders(<MoveParameterMenu parameterId={TEST_PARAMETER.id} />, {
    storeInitialState: createMockState({
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            dashcards: dashcards.map((dc) => dc.id),
          },
        },
        dashcards: {
          ..._.indexBy(dashcards, "id"),
          ..._.indexBy(otherDashboardDashcards, "id"),
        },
      }),
    }),
  });

  await userEvent.click(screen.getByPlaceholderText("Move filter"));
  await screen.findByRole("listbox");
}

describe("MoveParameterMenu", () => {
  it("should display potential destinations for a filter with one dashboard tab", async () => {
    await setup({
      dashcards: [TEST_DASHCARD, TEST_HEADING_DASHCARD],
    });

    expect(screen.getByText("Top of page")).toBeInTheDocument();
    expect(screen.getByText("My question card")).toBeInTheDocument();
    expect(screen.getByText("My heading card")).toBeInTheDocument();
  });

  it("should display potential destinations for a filter with many dashboard tabs", async () => {
    await setup({
      tabs: [
        createMockDashboardTab({ id: 1, name: "Tab 1" }),
        createMockDashboardTab({ id: 2, name: "Tab 2" }),
      ],
      dashcards: [
        {
          ...TEST_DASHCARD,
          dashboard_tab_id: 1,
        },
        { ...TEST_HEADING_DASHCARD, dashboard_tab_id: 2 },
      ],
    });

    expect(screen.getByText("Top of page")).toBeInTheDocument();
    expect(screen.getByText("My question card")).toBeInTheDocument();
    expect(screen.getByText("My heading card")).toBeInTheDocument();

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should highlight the 'Top of page' option for a dashboard header filter", async () => {
    await setup({
      dashcards: [TEST_DASHCARD],
    });

    expect(
      screen.getByText("Top of page").closest("[role='option']"),
    ).toHaveAttribute("aria-selected", "true");

    expect(
      screen.getByText("My question card").closest("[role='option']"),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("should highlight the current filter card", async () => {
    await setup({
      dashcards: [
        {
          ...TEST_DASHCARD,
          inline_parameters: [TEST_PARAMETER.id],
        },
      ],
    });

    expect(
      screen.getByText("My question card").closest("[role='option']"),
    ).toHaveAttribute("aria-selected", "true");

    expect(
      screen.getByText("Top of page").closest("[role='option']"),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("should not show cards that can't have a filter on them", async () => {
    await setup({
      dashcards: [
        TEST_DASHCARD,
        createMockTextDashboardCard({ id: 3 }),
        createMockActionDashboardCard({ id: 4 }),
        createMockLinkDashboardCard({ id: 5 }),
        createMockIFrameDashboardCard({ id: 6 }),
      ],
    });

    // top of page + question dashcard
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("should ignore tabs without dashcards", async () => {
    await setup({
      dashcards: [
        {
          ...TEST_DASHCARD,
          dashboard_tab_id: 1,
        },
        {
          ...TEST_HEADING_DASHCARD,
          dashboard_tab_id: 2,
        },
      ],
      tabs: [
        createMockDashboardTab({ id: 1, name: "Tab 1" }),
        createMockDashboardTab({ id: 2, name: "Tab 2" }),
        createMockDashboardTab({ id: 3, name: "Tab 3" }),
      ],
    });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
    expect(screen.queryByText("Tab 3")).not.toBeInTheDocument();
  });

  it("should use daschard's 'card.title' setting when available", async () => {
    await setup({
      dashcards: [
        {
          ...TEST_DASHCARD,
          visualization_settings: {
            "card.title": "My custom card title",
          },
        },
      ],
    });

    expect(screen.getByText("My custom card title")).toBeInTheDocument();
    expect(screen.queryByText("My question card")).not.toBeInTheDocument();
  });
});
