import { render, screen } from "@testing-library/react";

import { createMockDashboard } from "metabase-types/api/mocks";

import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState";

describe("DashboardEmptyState", () => {
  it("renders", () => {
    render(
      <DashboardEmptyState
        dashboard={createMockDashboard()}
        isNightMode={false}
        addQuestion={jest.fn()}
        closeNavbar={jest.fn()}
      />,
    );

    expect(screen.getByText("?")).toBeInTheDocument();
    expect(
      screen.getByText("This dashboard is looking empty."),
    ).toBeInTheDocument();
    expect(screen.getByText("Add a saved question")).toBeInTheDocument();
    expect(screen.getByText("ask a new one")).toBeInTheDocument();
  });
});

describe("DashboardEmptyStateWithoutAddPrompt", () => {
  it("renders", () => {
    render(<DashboardEmptyStateWithoutAddPrompt isNightMode={false} />);

    expect(screen.getByText("There's nothing here, yet.")).toBeInTheDocument();
  });
});
