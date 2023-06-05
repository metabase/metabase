import { render, screen } from "@testing-library/react";

import DashboardEmptyState from "./DashboardEmptyState";

describe("DashboardEmptyState", () => {
  it("renders", () => {
    render(
      <DashboardEmptyState
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
